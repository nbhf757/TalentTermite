-- Talent Pest Control Pricing (9/17/2025), loaded from TALENT PRICING UPDATED_Sept.csv
-- Re-runnable: clears rows from this source first.
-- (first load: table was empty)

insert into price_items (section, name, unit, qty_source, unit_price, min_price, initial_price, recurring_price, recurring_interval, description, rep_notes, sort_order) values
-- Stand-alone treatments
('pest','Termidor HE Termite Treatment','lf','perimeter_lf',8.65,425,null,null,null,null,null,10),
('pest','Soil Pre-Treatment','sf','manual',4.00,425,null,null,null,null,null,20),
('pest','Fungus/Beetle Treatment','sf','interior_sf',0.80,375,null,null,null,null,'Min $375 for spot treat',30),
('pest','DSV Fog (under 1,500 sq ft)','lump',null,375,null,null,null,null,null,null,40),
('pest','DSV Fog (over 1,500 sq ft)','lump',null,425,null,null,null,null,null,null,41),
('pest','Rubber Mulch (termite resistant)','sf','manual',8.00,null,null,null,null,'Remove wood mulch, weed barrier, granular treatment, and new install',null,50),
-- Moisture (a la carte)
('moisture','Vapor Barrier (10 mil)','sf','interior_sf',1.55,null,null,null,null,null,null,100),
('moisture','Vapor Barrier (10 mil), taped seams','sf','interior_sf',1.75,null,null,null,null,null,null,101),
('moisture','Vapor Barrier (12 mil woven)','sf','interior_sf',3.35,null,null,null,null,null,null,102),
('moisture','Vapor Barrier (12 mil woven), taped seams','sf','interior_sf',3.70,null,null,null,null,null,null,103),
('moisture','Vapor Barrier (20 mil)','sf','interior_sf',3.55,null,null,null,null,null,null,104),
('moisture','Vapor Barrier (20 mil), taped seams','sf','interior_sf',3.80,null,null,null,null,null,null,105),
('moisture','Vapor Barrier Install Only','sf','interior_sf',1.25,null,null,null,null,null,null,106),
('moisture','Vapor Barrier Removal Only','sf','interior_sf',0.75,null,null,null,null,null,null,107),
('moisture','Dehumidifier (with electrician)','each','manual',3800,null,null,null,null,null,null,110),
('moisture','Dehumidifier (no outlet needed)','each','manual',3300,null,null,null,null,null,null,111),
('moisture','Dehumidifier Swap (no electrician)','each','manual',2800,null,null,null,null,null,null,112),
('moisture','Vent Covers','each','manual',60,null,null,null,null,null,null,120),
('moisture','Sump Pump (with electrician)','each','manual',3500,null,null,null,null,null,'1 pump per 75 ln ft',130),
('moisture','Sump Pump (no electrician)','each','manual',3000,null,null,null,null,null,'1 pump per 75 ln ft',131),
('moisture','Additional Sump Pump','each','manual',2850,null,null,null,null,null,'Depends on outlet locations',132),
('moisture','French Drain (outside)','lf','perimeter_lf',30,null,null,null,null,null,null,140),
('moisture','French Drain (inside)','lf','perimeter_lf',35,null,null,null,null,null,null,141),
('moisture','Screen Crawl Vents','each','manual',40,null,null,null,null,null,null,150),
('moisture','Drip Edge (one story)','lf','manual',15,null,null,null,null,null,null,160),
('moisture','Custom Drip Edge (one story)','lf','manual',17.50,null,null,null,null,null,null,161),
('moisture','Siding Shield','lf','manual',17.50,null,null,null,null,null,null,162),
('moisture','Full Encapsulation (with foam)','sf','interior_sf',11.50,null,null,null,null,'Includes 20 mil vapor barrier attached to walls, foam board, vent covers, taped seams, dehumidifier with electrician, and fungus treatment','Add ~12 sq ft per pier for pier wrapping. Over 2,500 sq ft may need an additional dehumidifier.',170),
('moisture','Full Encapsulation (no foam)','sf','interior_sf',11.00,null,null,null,null,'Includes 20 mil vapor barrier attached to walls, vent covers, taped seams, dehumidifier with electrician, and fungus treatment','Add ~12 sq ft per pier for pier wrapping. Over 2,500 sq ft may need an additional dehumidifier.',171),
('moisture','Crawl Space Insulation Install (R19)','sf','interior_sf',3.80,null,null,null,null,null,'By section: 1 batt is about 9 sq ft',180),
('moisture','Crawl Space Insulation Removal','sf','interior_sf',1.75,null,null,null,null,null,'Sheet lists $1.75 with no unit; assumed per sq ft',181),
('moisture','Crawl Space Insulation Removal + Install','sf','interior_sf',4.75,null,null,null,null,null,null,182),
-- Wood repairs
('foundation','Floor Joist','each','manual',225,null,null,null,null,null,null,200),
('foundation','Sill Plate (under 8 ft)','each','manual',525,null,null,null,null,null,null,210),
('foundation','Band Board (first 3 sections)','lump','manual',225,null,null,null,null,null,'Minimum of 3 sections',220),
('foundation','Band Board (each section after 3)','each','manual',75,null,null,null,null,null,null,221),
('foundation','Girder','each','manual',625,null,null,null,null,null,null,230),
('foundation','Subfloor Section','each','manual',225,null,null,null,null,null,null,240),
('foundation','Subfloor Remove & Replace (top down)','sf','manual',25,null,null,null,null,'Covers demo and new board',null,241),
('foundation','Dumpster Fee (large demo)','lump',null,450,null,null,null,null,null,null,242),
('foundation','New Crawl Vent','each','manual',65,null,null,null,null,null,null,250),
('foundation','New Crawl Door','each','manual',425,null,null,null,null,null,null,251),
('foundation','New Crawl Door with Frame / Custom','each','manual',575,null,null,null,null,null,null,252),
-- Attic
('attic','Attic Insulation R-49 (13 in), removal 10 in or less','sf','attic_sf',6.00,null,null,null,null,null,null,300),
('attic','Attic Insulation R-49 (13 in), removal over 10 in','sf','attic_sf',6.35,null,null,null,null,null,null,301),
('attic','Attic Insulation Cap (6 in), install only','sf','attic_sf',4.00,null,null,null,null,null,null,302),
-- Recurring services (interval for Basic/Plus/Premium to be confirmed)
('recurring','Talent Basic (not advertised)','each',null,49,null,225,49,'service','General pest control',null,400),
('recurring','Talent Plus','each',null,69,null,250,69,'service','General pest + rodents',null,401),
('recurring','Talent Premium','each',null,99,null,275,99,'service','General pest + rodent + mosquito',null,402),
('recurring','Sentricon (no active termites)','each',null,30,null,729,30,'month',null,'Commercial: contact sales manager',410),
('recurring','Sentricon (no active termites, over 400 ln ft)','each',null,30,null,929,30,'month',null,'Commercial: contact sales manager',411),
('recurring','Termite Warranty','each',null,175,null,null,175,'year',null,null,420),
('recurring','Dehumidifier Maintenance','each',null,285,null,null,285,'year','Every 6 months: clean, filter changed, tubing changed if needed','Our installs only',421),
('recurring','Encapsulation Warranty','each',null,350,null,null,350,'year','Dehumidifier warranty plus vapor barrier reinforcement',null,422),
('recurring','Mosquito (stand-alone)','each',null,125,null,null,125,'month','For months where active',null,430),
('pest','One-Time Pest Service (not advertised)','lump',null,275,null,null,null,null,'No guarantee',null,60),
('foundation','Misc Hourly Work','hour','manual',225,null,null,null,null,'Per person, per hour',null,260);

-- Warranty text on every one-time job; Aprilaire 5-year on dehumidifiers
update price_items set warranty_text = '1-year workmanship guarantee' where section <> 'recurring' and source = 'pricing_sheet_2025-09-17';
update price_items set warranty_text = '1-year workmanship guarantee; Aprilaire 5-year dehumidifier warranty'
  where section = 'moisture' and (name like 'Dehumidifier%' or name like 'Full Encapsulation%');
