# PDF Generation Module - Documentation

## Overview
The PDF generation module provides professional PO (Purchase Order), worker, and GDPR PDFs with dynamic branding based on admin-configured site settings. PDF rendering is browser-side using PDFKit, while the backend provides authenticated JSON data via `/pdf-data/*` endpoints.

## Features
- **Professional Design**: Clean, modern PO template with company branding
- **Dynamic Settings**: Logo, header colors, and company info pulled from admin settings
- **Multiple Download Options**: Download as attachment or view inline in browser
- **Secure**: Requires authentication and proper authorization
- **Flexible**: Can be called from any page via simple utility functions

## Database Setup

### Site Settings Table
The module uses a `site_settings` table to store configurable values:

```sql
-- All available settings:
- logo_path: Path to company logo file (e.g., '/assets/logo.png')
- header_color: Primary color in hex format (e.g., '#2563eb')
- accent_color: Secondary/accent color (e.g., '#1e40af')
- company_name: Company name for branding (e.g., 'Castlerock Homes')
- company_address: Full company address
- company_phone: Phone number
- company_email: Email address
```

To run the migration:
```bash
npm run migrate
```

## API Endpoints

### Get PO Data for PDF Rendering
```
GET /pdf-data/po/:poId
Headers: Authorization: Bearer <token>
Response: { poData, invoices, settings }
```

### Get Worker Data for PDF Rendering
```
GET /pdf-data/worker/:workerId
Headers: Authorization: Bearer <token>
Role: super_admin or admin
Response: { workerData, leaveSummary, settings, userRole }
```

### Get Blank Worker Data for PDF Rendering
```
GET /pdf-data/worker-blank
Headers: Authorization: Bearer <token>
Role: super_admin or admin
Response: { workerData, leaveSummary, settings, isBlank, userRole }
```

### Get GDPR Data for PDF Rendering
```
GET /pdf-data/gdpr
Headers: Authorization: Bearer <token>
Response: { settings }
```

### Get All Settings
```
GET /settings
Headers: Authorization: Bearer <token>
Role: super_admin or admin
Response: { key: value, ... }
```

### Get Specific Setting
```
GET /settings/:key
Headers: Authorization: Bearer <token>
Role: super_admin or admin
Response: { key, value }
```

### Update Setting
```
PUT /settings/:key
Headers: Authorization: Bearer <token>
Role: super_admin or admin
Body: { value: "new_value" }
Response: { success, key, value }
```

### Update Multiple Settings
```
POST /settings/bulk
Headers: Authorization: Bearer <token>
Role: super_admin or admin
Body: { 
  "header_color": "#ff0000",
  "company_name": "New Company Name"
}
Response: { success, message, updates }
```

## Frontend Usage

### 1. Include the Utility Script
Add this to any page where you want PDF functionality:
```html
<script src="/pdfkit-generator.js"></script>
<script src="/pdf-utils.js"></script>
```

### 2. Download PDF (Attachment)
```javascript
// Simple download
downloadPOPDF(poId);

// Or as a button click
<button onclick="downloadPOPDF(123)">Download PDF</button>
```

### 3. View PDF (Inline)
```javascript
// Open in new window
viewPOPDF(poId);

// Or as a button click
<button onclick="viewPOPDF(123)">View PDF</button>
```

### 4. Add Button Group to Element
```javascript
const container = document.getElementById('myContainer');
addPDFButtons(poId, container);
// Creates View and Download buttons
```

### 5. Create PDF Button Programmatically
```javascript
const btn = createPDFButton(123, 'Download as PDF');
container.appendChild(btn);
```

### 6. Batch Download Multiple PDFs
```javascript
downloadMultiplePOs([123, 124, 125]);
```

## Integration Examples

### In Dashboard/PO Table
```javascript
// Add PDF button to each row
const renderPORow = (po) => {
  const row = document.createElement('tr');
  row.innerHTML = `<td>${po.po_number}</td>...</tr>`;
  
  const actionCell = document.createElement('td');
  addPDFButtons(po.id, actionCell);
  row.appendChild(actionCell);
  
  return row;
};
```

### In PO Details Page
```html
<button class="btn btn-outline-primary" onclick="downloadPOPDF(poId)">
  <i class="bi bi-download me-2"></i>Download PDF
</button>

<button class="btn btn-outline-secondary" onclick="viewPOPDF(poId)">
  <i class="bi bi-eye me-2"></i>View PDF
</button>
```

### In Admin Settings Page
```javascript
// Fetch current settings
const settings = await fetch('/settings', {
  headers: { Authorization: 'Bearer ' + token }
}).then(r => r.json());

// Update logo
await fetch('/settings/logo_path', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + token
  },
  body: JSON.stringify({ value: '/assets/new-logo.png' })
});

// Update colors
await fetch('/settings/bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + token
  },
  body: JSON.stringify({
    header_color: '#ff0000',
    accent_color: '#cc0000'
  })
});
```

## PDF Template Information

### What's Included
- Company logo (from settings)
- Company branding colors (header and accent)
- PO number and date
- Supplier information
- Site, location, and stage details
- Description/notes
- Financial summary (net, VAT, total)
- Company contact information
- Page numbering and generation timestamp

### Customizing the PDF Template
To modify the PDF template design, edit the `generatePOHTML()` function in:
```
public/pdfkit-generator.js
```

You can customize:
- Colors (header_color, accentColor variables)
- Fonts and sizing
- Layout and spacing
- What data fields are included

## Settings Caching

The SettingsService caches settings in memory for 5 minutes to reduce database queries. To clear the cache:

```javascript
// In Node.js code
const SettingsService = require('./services/settingsService');
SettingsService.clearCache();
```

## Error Handling

All endpoints include error handling with meaningful error messages:
```javascript
try {
  downloadPOPDF(poId);
} catch (error) {
  console.error('PDF download failed:', error);
  showToast('Error downloading PDF', 'error');
}
```

## Security

- All PDF generation endpoints require authentication
- Settings management endpoints require admin/super_admin role
- PDF access requires user to have general PO viewing permissions
- Settings changes are logged in audit trail

## Troubleshooting

### "Failed to generate PDF"

- Ensure `/pdfkit-generator.js` is included before `/pdf-utils.js`
- Ensure PDFKit CDN scripts load successfully in browser dev tools
- Ensure `/pdf-data/*` requests return `200` and valid JSON
- Ensure database connection is working

### EC2 (Amazon Linux 2023) - PDF Dependencies
No Chromium/Puppeteer server dependencies are required.
PDF rendering runs in the browser using PDFKit.

### PDF renders incorrectly
- Verify logo path exists: `/assets/logo.png`
- Check that color values are valid hex codes
- Review PO data completeness in database

### Settings not updating
- Clear browser cache and reload
- Verify user has admin/super_admin role
- Check that settings table is populated

## Migration Path

To add PDF functionality to existing pages:

1. Add `<script src="/pdf-utils.js"></script>` to the view
2. Identify where to place PDF buttons
3. Call `addPDFButtons(poId, containerElement)` or use direct functions
4. Test PDF generation with sample PO

## Future Enhancements
- Multi-format export (Excel, Word)
- Email PO directly from system
- Batch email multiple POs
- PDF templates customization UI
- Digital signature support
