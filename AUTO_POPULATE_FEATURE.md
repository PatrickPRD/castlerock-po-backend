# Auto-Populate Sites & Locations Feature

## What It Does

This feature automatically populates and updates sites and locations based on existing Purchase Order data.

### How It Works

1. **Analyzes PO Numbers**: Extracts the first letter from each PO number (e.g., 'B' from 'B73001')
2. **Maps to Sites**: Associates each letter with a site:
   - B = Bandon
   - M = Midleton
   - P = Phase 2
   - T = Test Site (excluded from auto-populate)

3. **Updates Sites**: Updates site names to match the mapping
4. **Updates Locations**: Associates locations with the correct sites based on which site their POs belong to

## How to Use

1. Navigate to the **Admin** page
2. Scroll to the **Sites** section
3. Click the **🔄 Auto-Populate from POs** button (green button in the top right)
4. Confirm the action
5. The system will:
   - Update site names based on PO letter mapping
   - Update location associations based on their POs
   - Show a summary of changes made

## What Gets Updated

### Sites
- Site names are updated to match the letter mapping
- Existing site IDs are preserved
- All related POs remain linked

### Locations  
- Locations are re-associated with sites based on their Purchase Orders
- If a location has POs from multiple sites, it uses the site with the most POs
- All PO relationships are preserved

## Backend Endpoint

**POST** `/admin/auto-populate-sites`
- **Auth Required**: Super Admin only
- **Returns**: 
  - List of site updates
  - Number of location updates
  - Summary of sites with PO counts

## Current Site Mapping

Based on existing PO data:
- **B** (3,010 POs) → Bandon
- **M** (541 POs) → Midleton
- **P** (549 POs) → Phase 2
- **T** (1 PO) → Test Site (excluded from auto-populate, should be removed)

## Safety Features

- Confirmation dialog before executing
- Only Super Admins can run this
- Preserves all existing PO relationships
- Updates are logged to console
- Shows detailed summary after completion
