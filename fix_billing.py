with open('/home/user/jewellery-erp/packages/frontend/src/modules/billing/BillingPage.tsx') as f:
    s = f.read()

# Fix the closing div stack: there are 4 </div> but the inner form-grid is unclosed.
# Current (after footer-closing = indent14, then 2 at indent12, then 1 at indent10):
old = '              </div>\n            </div>\n            </div>\n          </div>'
new = '              </div>\n              </div>\n            </div>\n          </div>'
if old in s:
    s = s.replace(old, new, 1)
    print('PATTERN REPLACED: added form-grid close')
else:
    print('Pattern not found - trying alternate indent')
    # Try other indent patterns
    alt_old = '              </div>\n            </div>\n            </div>\n        </div>'
    alt_new = '              </div>\n              </div>\n            </div>\n          </div>'
    if alt_old in s:
        s = s.replace(alt_old, alt_new, 1)
        print('ALT PATTERN REPLACED')
    else:
        print('Neither pattern found - dumping last 8 lines')
        lines = s.split('\n')
        for i in range(len(lines)-8, len(lines)):
            print(f'  {i+1}: [{lines[i]}]')

with open('/home/user/jewellery-erp/packages/frontend/src/modules/billing/BillingPage.tsx', 'w') as f:
    f.write(s)
    print('File written.')