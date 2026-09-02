import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ProductsModule } from './modules/products/products.module';
import { JewelleryModule } from './modules/jewellery/jewellery.module';
import { BarcodesModule } from './modules/barcodes/barcodes.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { RatesModule } from './modules/rates/rates.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { UrdModule } from './modules/urd/urd.module';
import { JobOrdersModule } from './modules/job-orders/job-orders.module';
import { JobWorkModule } from './modules/job-work/job-work.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BranchesModule } from './modules/branches/branches.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { RepairsModule } from './modules/repairs/repairs.module';
import { PrintingModule } from './modules/printing/printing.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { OrnamentsModule } from './modules/ornaments/ornaments.module';
import { QuotationsModule } from './modules/quotations/quotations.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    BranchesModule,
    CustomersModule,
    SuppliersModule,
    ProductsModule,
    JewelleryModule,
    BarcodesModule,
    InventoryModule,
    RatesModule,
    SalesModule,
    PurchasesModule,
    UrdModule,
    JobOrdersModule,
    JobWorkModule,
    PaymentsModule,
    ReportsModule,
    SettingsModule,
    AuditModule,
    NotificationsModule,
    DashboardModule,
    EmployeesModule,
    RepairsModule,
    PrintingModule,
    LedgerModule,
    OrnamentsModule,
    QuotationsModule,
  ],
})
export class AppModule {}
