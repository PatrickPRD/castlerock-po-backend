-- Ensure Site stage exists
INSERT INTO po_stages (name, active)
SELECT 'Site', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM po_stages WHERE name = 'Site');

-- Ensure Site location exists for each site
INSERT INTO locations (name, type, site_id, active)
SELECT 'Site', 'system', s.id, 1
FROM sites s
WHERE NOT EXISTS (
  SELECT 1 FROM locations l WHERE l.site_id = s.id AND l.name = 'Site'
);
