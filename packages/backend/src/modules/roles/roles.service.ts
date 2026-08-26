import { Injectable, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

const { DEFAULT_ROLE_PERMISSIONS } = require('../../../prisma/default-role-permissions.cjs') as {
  DEFAULT_ROLE_PERMISSIONS: Record<string, string[]>;
};

/** Permission catalog grouped by module (read/write access model). */
export const PERMISSION_CATALOG: { module: string; label: string; permissions: { name: string; action: 'read' | 'write'; label: string }[] }[] = [
  { module: 'DASHBOARD', label: 'Dashboard', permissions: [{ name: 'DASHBOARD_VIEW', action: 'read', label: 'View dashboard' }] },
  { module: 'BILLING', label: 'Billing / POS', permissions: [
    { name: 'BILLING_VIEW', action: 'read', label: 'View bills' },
    { name: 'BILLING_CREATE', action: 'write', label: 'Create / edit bills' },
    { name: 'BILLING_FINALIZE', action: 'write', label: 'Finalize & save bill' },
    { name: 'BILLING_CANCEL', action: 'write', label: 'Cancel bills' },
    { name: 'BILLING_EDIT_DRAFT', action: 'write', label: 'Edit drafts' },
  ]},
  { module: 'INVENTORY', label: 'Inventory', permissions: [
    { name: 'INVENTORY_VIEW', action: 'read', label: 'View stock' },
    { name: 'INVENTORY_ADJUST', action: 'write', label: 'Adjust stock' },
    { name: 'INVENTORY_TRANSFER', action: 'write', label: 'Transfer stock' },
  ]},
  { module: 'CUSTOMERS', label: 'Customers', permissions: [
    { name: 'CUSTOMERS_VIEW', action: 'read', label: 'View customers' },
    { name: 'CUSTOMERS_CREATE', action: 'write', label: 'Create customers' },
    { name: 'CUSTOMERS_EDIT', action: 'write', label: 'Edit customers' },
  ]},
  { module: 'REPORTS', label: 'Reports', permissions: [
    { name: 'REPORTS_VIEW', action: 'read', label: 'View reports' },
    { name: 'REPORTS_GST', action: 'read', label: 'GST reports' },
    { name: 'REPORTS_FINANCIAL', action: 'read', label: 'Financial reports' },
    { name: 'REPORTS_EXPORT', action: 'write', label: 'Export reports' },
    { name: 'PROFIT_VIEW', action: 'read', label: 'View profit' },
  ]},
  { module: 'EMPLOYEES', label: 'Employees / Workers', permissions: [
    { name: 'EMPLOYEES_VIEW', action: 'read', label: 'View employees' },
    { name: 'EMPLOYEES_MANAGE', action: 'write', label: 'Manage employees' },
    { name: 'SALARY_VIEW', action: 'read', label: 'View salaries' },
  ]},
  { module: 'JOB_WORK', label: 'Job Work', permissions: [
    { name: 'JOB_WORK_VIEW', action: 'read', label: 'View job orders' },
    { name: 'JOB_WORK_CREATE', action: 'write', label: 'Create job orders' },
    { name: 'JOB_WORK_ASSIGN', action: 'write', label: 'Assign workers' },
  ]},
  { module: 'PURCHASES', label: 'Purchases', permissions: [{ name: 'PURCHASE_COST_VIEW', action: 'read', label: 'View purchase cost' }] },
  { module: 'SETTINGS', label: 'Settings', permissions: [{ name: 'SETTINGS_MANAGE', action: 'write', label: 'Manage settings' }] },
  { module: 'USERS', label: 'Users', permissions: [
    { name: 'USERS_MANAGE', action: 'write', label: 'Manage users' },
    { name: 'ROLES_MANAGE', action: 'write', label: 'Manage roles' },
  ]},
  { module: 'BRANCHES', label: 'Branches', permissions: [{ name: 'BRANCHES_MANAGE', action: 'write', label: 'Manage branches' }] },
  { module: 'AUDIT', label: 'Audit', permissions: [{ name: 'AUDIT_VIEW', action: 'read', label: 'View audit log' }] },
];

@Injectable()
export class RolesService implements OnModuleInit {
  private defaultsReady: Promise<void> | null = null;

  constructor(private prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSystemRoles();
  }

  /** Ensure every known permission exists as a DB row (idempotent). */
  private async ensureCatalog() {
    for (const group of PERMISSION_CATALOG) {
      for (const p of group.permissions) {
        await this.prisma.permission.upsert({
          where: { name: p.name },
          update: { module: group.module },
          create: { name: p.name, module: group.module, description: p.label },
        });
      }
    }
  }

  /**
   * Ensure built-in roles exist in the database as well as in the user form.
   *
   * The desktop template database historically created users with a role
   * string but did not seed the Role/RolePermission tables. Keeping this
   * idempotent runtime repair means existing installations are fixed on the
   * next backend start; new template databases are seeded by seed-desktop.cjs.
   */
  async ensureSystemRoles(): Promise<void> {
    if (!this.defaultsReady) {
      this.defaultsReady = this.seedSystemRoles().catch((error) => {
        this.defaultsReady = null;
        throw error;
      });
    }
    await this.defaultsReady;
  }

  private async seedSystemRoles(): Promise<void> {
    await this.ensureCatalog();

    for (const [roleName, permissionNames] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const role = await this.prisma.role.upsert({
        where: { name: roleName },
        update: { isSystem: true },
        create: { name: roleName, description: `${roleName} role`, isSystem: true },
      });

      for (const permissionName of permissionNames) {
        const permission = await this.prisma.permission.findUnique({ where: { name: permissionName } });
        if (!permission) continue;
        await this.prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }
    }
  }

  /** Return the permission catalog with a per-module read/write summary. */
  async getCatalog() {
    await this.ensureSystemRoles();
    return PERMISSION_CATALOG;
  }

  /** List roles with their granted permission names. */
  async findAll() {
    await this.ensureSystemRoles();
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { permissions: { include: { permission: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((rp) => rp.permission.name),
    }));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((rp) => rp.permission.name),
    };
  }

  /** Create a custom role with a chosen permission matrix. */
  async create(data: { name: string; description?: string; permissions?: string[] }) {
    const name = (data.name || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!name) throw new BadRequestException('Role name is required');
    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) throw new BadRequestException(`Role "${name}" already exists`);

    await this.ensureSystemRoles();
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];
    const role = await this.prisma.role.create({
      data: { name, description: data.description || name + ' role', isSystem: false },
    });
    await this.grantPermissions(role.id, permissions);
    return this.findOne(role.id);
  }

  /** Update a role's description & permission matrix. */
  async update(id: string, data: { name?: string; description?: string; permissions?: string[] }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');

    // System roles can have their description/permissions updated but not renamed.
    const name = data.name ? data.name.trim().toUpperCase().replace(/\s+/g, '_') : role.name;

    await this.ensureSystemRoles();
    await this.prisma.role.update({
      where: { id },
      data: { name, description: data.description ?? role.description },
    });
    if (Array.isArray(data.permissions)) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.grantPermissions(id, data.permissions);
    }
    return this.findOne(id);
  }

  /** Wire a set of permission names to a role by resolving them to IDs. */
  private async grantPermissions(roleId: string, names: string[]) {
    for (const name of names) {
      const perm = await this.prisma.permission.findUnique({ where: { name } });
      if (!perm) continue;
      const link = await this.prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId, permissionId: perm.id } },
      });
      if (!link) {
        await this.prisma.rolePermission.create({ data: { roleId, permissionId: perm.id } });
      }
    }
  }

  /** Delete a custom role (system roles cannot be removed). */
  async remove(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Cannot delete a system role');
    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }
}
