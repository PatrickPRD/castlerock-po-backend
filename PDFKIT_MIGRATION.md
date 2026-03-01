# PDFKit Browser-Based PDF Generation Migration

## Overview

This branch migrates PDF generation from server-side Puppeteer (headless Chrome) to browser-based PDFKit. This significantly reduces RAM usage on EC2 instances since PDF generation now happens in the user's browser instead of on the server.

## What Changed

### Before (Puppeteer / Server-Side)
- Server generated HTML
- Server launched headless Chrome browser via Puppeteer
- Server converted HTML to PDF
- Server sent PDF buffer to client
- **High RAM usage on server** (especially problematic on EC2)

### After (PDFKit / Browser-Side)
- Server sends JSON data
- Client loads PDFKit from CDN
- Client generates PDF using PDFKit in the browser
- **Zero RAM usage on server for PDF generation**
- Faster for users (no server processing time)

## New Architecture

### Backend Changes

1. **New Routes: `/pdf-data/*`**
   - `/pdf-data/po/:poId` - Returns PO data as JSON
   - `/pdf-data/worker/:workerId` - Returns worker data as JSON
   - `/pdf-data/worker-blank` - Returns blank worker form data
   - `/pdf-data/gdpr` - Returns GDPR data as JSON

2. **Removed Dependency**
   - Puppeteer removed from package.json
   - ~87 packages removed (including Chromium)
   - Significant reduction in node_modules size

### Frontend Changes

1. **New File: `public/pdfkit-generator.js`**
   - Loads PDFKit from CDN
   - `generatePOPDF()` - Generates PO PDFs
   - `generateWorkerPDF()` - Generates worker PDFs
   - `generateGDPRPDF()` - Generates GDPR PDFs

2. **Updated File: `public/pdf-utils.js`**
   - Now fetches JSON data from `/pdf-data/*` endpoints
   - Calls PDFKit generator functions
   - Maintains same API for backward compatibility

3. **Updated Views**
   - Add `<script src="/pdfkit-generator.js"></script>` before pdf-utils.js
   - Updated: dashboard.ejs, invoice-report.ejs, gdpr.ejs, workers.ejs, workers-information.ejs

## Usage

### In HTML Views
```html
<!-- Load PDFKit generator first -->
<script src="/pdfkit-generator.js"></script>
<!-- Then load PDF utilities -->
<script src="/pdf-utils.js"></script>
```

### Download PO PDF
```javascript
// Same API as before - no changes needed in calling code
downloadPOPDF(poId, buttonElement);
```

### Download Worker PDF
```javascript
downloadWorkerPDF(workerId, buttonElement);
```

### Download GDPR PDF
```javascript
downloadGDPRPDF(buttonElement);
```

## Benefits

### Performance
- **Reduced EC2 RAM Usage**: No more launching Chrome instances on server
- **Faster PDF Generation**: No server processing time
- **Better Scalability**: Server can handle more concurrent users

### Cost Savings
- Can use smaller EC2 instances
- No need for Chromium dependencies on server
- Reduced node_modules size (~87 packages removed)

### User Experience
- PDFs generate faster
- No server load issues during peak times
- Works offline once page is loaded (PDFs cached in browser)

## Migration Notes

### Backward Compatibility

Old Puppeteer-based endpoints (`/pdfs/*`) are still available but deprecated:
- `/pdfs/po/:poId` - ⚠️ Deprecated (requires Puppeteer)
- `/pdfs/worker/:workerId` - ⚠️ Deprecated (requires Puppeteer)
- `/pdfs/worker-blank` - ⚠️ Deprecated (requires Puppeteer)
- `/pdfs/gdpr` - ⚠️ Deprecated (requires Puppeteer)

**Note**: These endpoints will fail since Puppeteer is removed. Use browser-based generation instead.

### Breaking Changes

None for end-users. The API remains the same:
- `downloadPOPDF(poId, button)` works exactly as before
- `downloadWorkerPDF(workerId, button)` works exactly as before
- `downloadGDPRPDF(button)` works exactly as before

## Deployment

### Before Deploying

1. **No EC2 dependencies needed**
   - Remove Puppeteer/Chromium dependencies installation steps
   - No need for: `sudo dnf install -y atk cairo cups-libs...`

2. **Update your deployment scripts**
   - Remove Puppeteer browser installation: `npx puppeteer browsers install chrome`

### After Deploying

1. **Test PDF generation**
   - Download a PO PDF
   - Download a worker PDF
   - Download GDPR PDF
   - Verify all work correctly

2. **Monitor performance**
   - Check EC2 RAM usage (should be significantly lower)
   - Verify PDF generation speed (should be faster)

## Troubleshooting

### "PDFKit generator not loaded"

**Cause**: pdfkit-generator.js not included in page

**Fix**: Add to view template:
```html
<script src="/pdfkit-generator.js"></script>
```

### PDF not downloading

**Cause**: Check browser console for errors

**Common issues**:
- Ad blockers blocking CDN scripts
- Browser extension interfering
- CORS issues with CDN

**Fix**: Ensure PDFKit CDN is accessible:
- https://cdn.jsdelivr.net/npm/pdfkit@0.15.0/js/pdfkit.standalone.js
- https://cdn.jsdelivr.net/npm/blob-stream@0.1.3/blob-stream.js

### PDF styling looks different

**Note**: PDFKit generates PDFs differently than Puppeteer. Some layout differences are expected and designed for optimal PDF rendering.

## Testing

### Manual Testing Checklist

- [ ] Download PO PDF from dashboard
- [ ] View PO PDF inline
- [ ] Download worker PDF from workers page
- [ ] Download worker PDF from workers information page
- [ ] Download blank worker form
- [ ] Download GDPR PDF
- [ ] Test with different data (empty fields, long text, etc.)
- [ ] Test on different browsers (Chrome, Firefox, Safari, Edge)
- [ ] Monitor EC2 RAM usage during PDF generation

### Expected Results

- All PDFs should download successfully
- PDFs should contain correct data
- No server errors in logs
- EC2 RAM usage should remain stable
- PDF generation should be instant

## Rollback Plan

If issues occur:

1. **Revert to main branch**
   ```bash
   git checkout main
   ```

2. **Reinstall Puppeteer**
   ```bash
   npm install puppeteer
   npx puppeteer browsers install chrome
   ```

3. **Restore EC2 dependencies** (on Amazon Linux 2023)
   ```bash
   sudo dnf install -y atk cairo cups-libs dbus-glib expat fontconfig freetype glib2 gtk3 libX11 libXcomposite libXcursor libXdamage libXext libXfixes libXi libXrandr libXrender libXScrnSaver libXtst nss pango alsa-lib
   ```

## Future Enhancements

- [ ] Add print preview before download
- [ ] Support for custom PDF templates
- [ ] Batch PDF generation with progress indicator
- [ ] PDF compression options
- [ ] Email PDF directly from browser

## Questions or Issues?

Contact the development team or create an issue in the repository.
