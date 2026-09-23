-- =============================================================================
-- SEED 03 — Indian passenger vehicle master.
-- Makes, models, generations (with year ranges and facelifts), search aliases.
-- Admin adds more from the app; this is a working starting set for Noida.
-- =============================================================================

insert into public.vehicle_makes (name, code, sort_order) values
  ('Maruti Suzuki', 'MSZ', 1),
  ('Hyundai',       'HYU', 2),
  ('Tata',          'TAT', 3),
  ('Mahindra',      'MAH', 4),
  ('Kia',           'KIA', 5),
  ('Toyota',        'TOY', 6),
  ('Honda',         'HON', 7),
  ('MG',            'MG',  8),
  ('Renault',       'REN', 9),
  ('Nissan',        'NIS', 10),
  ('Volkswagen',    'VW',  11),
  ('Skoda',         'SKD', 12),
  ('Jeep',          'JEE', 13),
  ('Citroen',       'CIT', 14),
  ('Ford',          'FRD', 15),
  ('Force',         'FOR', 16),
  ('Isuzu',         'ISU', 17),
  ('BMW',           'BMW', 20),
  ('Mercedes-Benz', 'MRC', 21),
  ('Audi',          'AUD', 22),
  ('Volvo',         'VLV', 23),
  ('Land Rover',    'LR',  24)
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- Models + generations. year_to NULL means "still on sale".
-- -----------------------------------------------------------------------------

-- Maruti Suzuki --------------------------------------------------------------
select seed_util.seed_vehicle('Maruti Suzuki','Swift','SWIFT','hatchback','2nd Gen 2011-2017', 2011, 2017);
select seed_util.seed_vehicle('Maruti Suzuki','Swift','SWIFT','hatchback','3rd Gen 2018-2023', 2018, 2023);
select seed_util.seed_vehicle('Maruti Suzuki','Swift','SWIFT','hatchback','4th Gen 2024+',      2024, null);
select seed_util.seed_vehicle('Maruti Suzuki','Baleno','BALENO','hatchback','1st Gen 2015-2021', 2015, 2021);
select seed_util.seed_vehicle('Maruti Suzuki','Baleno','BALENO','hatchback','Facelift 2022+',    2022, null, true);
select seed_util.seed_vehicle('Maruti Suzuki','WagonR','WAGONR','hatchback','2nd Gen 2010-2018', 2010, 2018);
select seed_util.seed_vehicle('Maruti Suzuki','WagonR','WAGONR','hatchback','3rd Gen 2019+',     2019, null);
select seed_util.seed_vehicle('Maruti Suzuki','Alto','ALTO','hatchback','Alto 800 2012-2022',    2012, 2022);
select seed_util.seed_vehicle('Maruti Suzuki','Alto K10','ALTOK10','hatchback','2022+',          2022, null);
select seed_util.seed_vehicle('Maruti Suzuki','Dzire','DZIRE','sedan','2nd Gen 2012-2016',       2012, 2016);
select seed_util.seed_vehicle('Maruti Suzuki','Dzire','DZIRE','sedan','3rd Gen 2017-2024',       2017, 2024);
select seed_util.seed_vehicle('Maruti Suzuki','Dzire','DZIRE','sedan','4th Gen 2024+',           2024, null);
select seed_util.seed_vehicle('Maruti Suzuki','Brezza','BREZZA','suv','Vitara Brezza 2016-2021', 2016, 2021);
select seed_util.seed_vehicle('Maruti Suzuki','Brezza','BREZZA','suv','2nd Gen 2022+',           2022, null);
select seed_util.seed_vehicle('Maruti Suzuki','Ertiga','ERTIGA','muv','1st Gen 2012-2018',       2012, 2018);
select seed_util.seed_vehicle('Maruti Suzuki','Ertiga','ERTIGA','muv','2nd Gen 2018+',           2018, null);
select seed_util.seed_vehicle('Maruti Suzuki','XL6','XL6','muv','2019+',                         2019, null);
select seed_util.seed_vehicle('Maruti Suzuki','Grand Vitara','GVITARA','suv','2022+',            2022, null);
select seed_util.seed_vehicle('Maruti Suzuki','Fronx','FRONX','suv','2023+',                     2023, null);
select seed_util.seed_vehicle('Maruti Suzuki','Jimny','JIMNY','suv','2023+',                     2023, null);
select seed_util.seed_vehicle('Maruti Suzuki','Ciaz','CIAZ','sedan','2014+',                     2014, null);
select seed_util.seed_vehicle('Maruti Suzuki','Celerio','CELERIO','hatchback','2nd Gen 2021+',   2021, null);
select seed_util.seed_vehicle('Maruti Suzuki','Ignis','IGNIS','hatchback','2017+',               2017, null);
select seed_util.seed_vehicle('Maruti Suzuki','S-Presso','SPRESSO','hatchback','2019+',          2019, null);
select seed_util.seed_vehicle('Maruti Suzuki','Eeco','EECO','muv','2010+',                       2010, null);
select seed_util.seed_vehicle('Maruti Suzuki','Invicto','INVICTO','muv','2023+',                 2023, null);

-- Hyundai --------------------------------------------------------------------
select seed_util.seed_vehicle('Hyundai','Creta','CRETA','suv','1st Gen 2015-2018',   2015, 2018);
select seed_util.seed_vehicle('Hyundai','Creta','CRETA','suv','Facelift 2018-2019',  2018, 2019, true);
select seed_util.seed_vehicle('Hyundai','Creta','CRETA','suv','2nd Gen 2020-2023',   2020, 2023);
select seed_util.seed_vehicle('Hyundai','Creta','CRETA','suv','Facelift 2024+',      2024, null, true);
select seed_util.seed_vehicle('Hyundai','Venue','VENUE','suv','1st Gen 2019-2022',   2019, 2022);
select seed_util.seed_vehicle('Hyundai','Venue','VENUE','suv','Facelift 2022+',      2022, null, true);
select seed_util.seed_vehicle('Hyundai','i20','I20','hatchback','Elite i20 2014-2020', 2014, 2020);
select seed_util.seed_vehicle('Hyundai','i20','I20','hatchback','3rd Gen 2020+',     2020, null);
select seed_util.seed_vehicle('Hyundai','i10','I10','hatchback','Grand i10 Nios 2019+', 2019, null);
select seed_util.seed_vehicle('Hyundai','Verna','VERNA','sedan','5th Gen 2017-2022', 2017, 2022);
select seed_util.seed_vehicle('Hyundai','Verna','VERNA','sedan','6th Gen 2023+',     2023, null);
select seed_util.seed_vehicle('Hyundai','Alcazar','ALCAZAR','suv','2021+',           2021, null);
select seed_util.seed_vehicle('Hyundai','Tucson','TUCSON','suv','2022+',             2022, null);
select seed_util.seed_vehicle('Hyundai','Exter','EXTER','suv','2023+',               2023, null);
select seed_util.seed_vehicle('Hyundai','Aura','AURA','sedan','2020+',               2020, null);
select seed_util.seed_vehicle('Hyundai','Santro','SANTRO','hatchback','2018-2022',    2018, 2022);

-- Tata -----------------------------------------------------------------------
select seed_util.seed_vehicle('Tata','Nexon','NEXON','suv','1st Gen 2017-2023',      2017, 2023);
select seed_util.seed_vehicle('Tata','Nexon','NEXON','suv','Facelift 2023+',         2023, null, true);
select seed_util.seed_vehicle('Tata','Punch','PUNCH','suv','2021+',                  2021, null);
select seed_util.seed_vehicle('Tata','Harrier','HARRIER','suv','2019-2023',          2019, 2023);
select seed_util.seed_vehicle('Tata','Harrier','HARRIER','suv','Facelift 2023+',     2023, null, true);
select seed_util.seed_vehicle('Tata','Safari','SAFARI','suv','2021-2023',            2021, 2023);
select seed_util.seed_vehicle('Tata','Safari','SAFARI','suv','Facelift 2023+',       2023, null, true);
select seed_util.seed_vehicle('Tata','Altroz','ALTROZ','hatchback','2020+',          2020, null);
select seed_util.seed_vehicle('Tata','Tiago','TIAGO','hatchback','2016+',            2016, null);
select seed_util.seed_vehicle('Tata','Tigor','TIGOR','sedan','2017+',                2017, null);
select seed_util.seed_vehicle('Tata','Curvv','CURVV','suv','2024+',                  2024, null);

-- Mahindra -------------------------------------------------------------------
select seed_util.seed_vehicle('Mahindra','Thar','THAR','suv','2nd Gen 2020+',        2020, null);
select seed_util.seed_vehicle('Mahindra','Thar Roxx','THARROXX','suv','2024+',       2024, null);
select seed_util.seed_vehicle('Mahindra','Scorpio','SCORPIO','suv','Classic 2014+',  2014, null);
select seed_util.seed_vehicle('Mahindra','Scorpio N','SCORPION','suv','2022+',       2022, null);
select seed_util.seed_vehicle('Mahindra','XUV700','XUV700','suv','2021+',            2021, null);
select seed_util.seed_vehicle('Mahindra','XUV300','XUV300','suv','2019-2024',        2019, 2024);
select seed_util.seed_vehicle('Mahindra','XUV 3XO','XUV3XO','suv','2024+',           2024, null);
select seed_util.seed_vehicle('Mahindra','Bolero','BOLERO','suv','2011+',            2011, null);
select seed_util.seed_vehicle('Mahindra','Bolero Neo','BOLERONEO','suv','2021+',     2021, null);
select seed_util.seed_vehicle('Mahindra','Marazzo','MARAZZO','muv','2018+',          2018, null);

-- Kia ------------------------------------------------------------------------
select seed_util.seed_vehicle('Kia','Seltos','SELTOS','suv','1st Gen 2019-2023',     2019, 2023);
select seed_util.seed_vehicle('Kia','Seltos','SELTOS','suv','Facelift 2023+',        2023, null, true);
select seed_util.seed_vehicle('Kia','Sonet','SONET','suv','1st Gen 2020-2023',       2020, 2023);
select seed_util.seed_vehicle('Kia','Sonet','SONET','suv','Facelift 2024+',          2024, null, true);
select seed_util.seed_vehicle('Kia','Carens','CARENS','muv','2022+',                 2022, null);
select seed_util.seed_vehicle('Kia','Carnival','CARNIVAL','muv','2020+',             2020, null);
select seed_util.seed_vehicle('Kia','EV6','EV6','suv','2022+',                       2022, null);

-- Toyota ---------------------------------------------------------------------
select seed_util.seed_vehicle('Toyota','Innova Crysta','INNOVA','muv','2016+',       2016, null);
select seed_util.seed_vehicle('Toyota','Innova Hycross','HYCROSS','muv','2022+',     2022, null);
select seed_util.seed_vehicle('Toyota','Fortuner','FORTUNER','suv','2nd Gen 2016+',  2016, null);
select seed_util.seed_vehicle('Toyota','Urban Cruiser Hyryder','HYRYDER','suv','2022+', 2022, null);
select seed_util.seed_vehicle('Toyota','Glanza','GLANZA','hatchback','2019+',        2019, null);
select seed_util.seed_vehicle('Toyota','Taisor','TAISOR','suv','2024+',              2024, null);
select seed_util.seed_vehicle('Toyota','Rumion','RUMION','muv','2023+',              2023, null);

-- Honda ----------------------------------------------------------------------
select seed_util.seed_vehicle('Honda','City','CITY','sedan','4th Gen 2014-2019',     2014, 2019);
select seed_util.seed_vehicle('Honda','City','CITY','sedan','5th Gen 2020+',         2020, null);
select seed_util.seed_vehicle('Honda','Amaze','AMAZE','sedan','2nd Gen 2018-2024',   2018, 2024);
select seed_util.seed_vehicle('Honda','Amaze','AMAZE','sedan','3rd Gen 2024+',       2024, null);
select seed_util.seed_vehicle('Honda','Elevate','ELEVATE','suv','2023+',             2023, null);
select seed_util.seed_vehicle('Honda','WR-V','WRV','suv','2017-2023',                2017, 2023);
select seed_util.seed_vehicle('Honda','Jazz','JAZZ','hatchback','2015-2023',         2015, 2023);

-- MG, Renault, Nissan, VW, Skoda ---------------------------------------------
select seed_util.seed_vehicle('MG','Hector','HECTOR','suv','2019+',                  2019, null);
select seed_util.seed_vehicle('MG','Astor','ASTOR','suv','2021+',                    2021, null);
select seed_util.seed_vehicle('MG','Gloster','GLOSTER','suv','2020+',                2020, null);
select seed_util.seed_vehicle('MG','Comet EV','COMET','hatchback','2023+',           2023, null);
select seed_util.seed_vehicle('MG','Windsor EV','WINDSOR','suv','2024+',             2024, null);
select seed_util.seed_vehicle('Renault','Kwid','KWID','hatchback','2015+',           2015, null);
select seed_util.seed_vehicle('Renault','Triber','TRIBER','muv','2019+',             2019, null);
select seed_util.seed_vehicle('Renault','Kiger','KIGER','suv','2021+',               2021, null);
select seed_util.seed_vehicle('Renault','Duster','DUSTER','suv','2012-2022',         2012, 2022);
select seed_util.seed_vehicle('Nissan','Magnite','MAGNITE','suv','2020+',            2020, null);
select seed_util.seed_vehicle('Volkswagen','Polo','POLO','hatchback','2010-2022',    2010, 2022);
select seed_util.seed_vehicle('Volkswagen','Virtus','VIRTUS','sedan','2022+',        2022, null);
select seed_util.seed_vehicle('Volkswagen','Taigun','TAIGUN','suv','2021+',          2021, null);
select seed_util.seed_vehicle('Skoda','Slavia','SLAVIA','sedan','2022+',             2022, null);
select seed_util.seed_vehicle('Skoda','Kushaq','KUSHAQ','suv','2021+',               2021, null);
select seed_util.seed_vehicle('Skoda','Kylaq','KYLAQ','suv','2024+',                 2024, null);
select seed_util.seed_vehicle('Skoda','Rapid','RAPID','sedan','2011-2021',           2011, 2021);
select seed_util.seed_vehicle('Jeep','Compass','COMPASS','suv','2017+',              2017, null);
select seed_util.seed_vehicle('Citroen','C3','C3','hatchback','2022+',               2022, null);
select seed_util.seed_vehicle('Ford','EcoSport','ECOSPORT','suv','2013-2021',        2013, 2021);
select seed_util.seed_vehicle('Ford','Figo','FIGO','hatchback','2015-2021',          2015, 2021);
select seed_util.seed_vehicle('Isuzu','D-Max V-Cross','DMAX','pickup','2016+',       2016, null);
select seed_util.seed_vehicle('Force','Gurkha','GURKHA','suv','2021+',               2021, null);

-- -----------------------------------------------------------------------------
-- Search aliases: how customers and staff actually type these names
-- -----------------------------------------------------------------------------
insert into public.vehicle_model_aliases (model_id, alias)
select vm.id, a.alias
from (values
  ('WagonR','Wagon R'), ('WagonR','Wagonr'),
  ('Scorpio N','Scorpio-N'), ('Scorpio N','ScorpioN'),
  ('XUV 3XO','XUV3XO'), ('XUV 3XO','XUV 300 Facelift'),
  ('Grand Vitara','GrandVitara'), ('Grand Vitara','G Vitara'),
  ('Innova Crysta','Crysta'), ('Innova Hycross','Hycross'),
  ('Urban Cruiser Hyryder','Hyryder'),
  ('Thar Roxx','Thar 5 Door'), ('Thar Roxx','Roxx'),
  ('S-Presso','Spresso'), ('S-Presso','S Presso'),
  ('i20','Elite i20'), ('i20','i 20'),
  ('i10','Grand i10'), ('i10','Nios'), ('i10','Grand i10 Nios'),
  ('Alto K10','K10'), ('Brezza','Vitara Brezza'),
  ('WR-V','WRV'), ('D-Max V-Cross','V-Cross'), ('D-Max V-Cross','Vcross'),
  ('Comet EV','Comet'), ('Windsor EV','Windsor'),
  ('Bolero Neo','Neo'), ('Punch','Tata Punch')
) as a(model, alias)
join public.vehicle_models vm on vm.name = a.model
on conflict (model_id, alias) do nothing;

-- -----------------------------------------------------------------------------
-- Vehicle -> bulb socket map. Lets "Creta 2024" surface the right H-number.
-- Values below are a starting set entered by the business and edited in Admin;
-- always confirm against the actual car before selling.
-- -----------------------------------------------------------------------------

select seed_util.seed_socket('Creta','Facelift 2024+','Low Beam','H7');
select seed_util.seed_socket('Creta','Facelift 2024+','High Beam','H1');
select seed_util.seed_socket('Creta','Facelift 2024+','Fog','H8');
select seed_util.seed_socket('Creta','2nd Gen 2020-2023','Low Beam','H7');
select seed_util.seed_socket('Creta','2nd Gen 2020-2023','Fog','H8');
select seed_util.seed_socket('Swift','3rd Gen 2018-2023','Low Beam','H4');
select seed_util.seed_socket('Swift','3rd Gen 2018-2023','Fog','H8');
select seed_util.seed_socket('Swift','4th Gen 2024+','Low Beam','H4');
select seed_util.seed_socket('WagonR','3rd Gen 2019+','Low Beam','H4');
select seed_util.seed_socket('Alto K10','2022+','Low Beam','H4');
select seed_util.seed_socket('Baleno','Facelift 2022+','Low Beam','H4');
select seed_util.seed_socket('Dzire','3rd Gen 2017-2024','Low Beam','H4');
select seed_util.seed_socket('Brezza','2nd Gen 2022+','Low Beam','H4');
select seed_util.seed_socket('Ertiga','2nd Gen 2018+','Low Beam','H4');
select seed_util.seed_socket('Nexon','Facelift 2023+','Low Beam','H11');
select seed_util.seed_socket('Nexon','1st Gen 2017-2023','Low Beam','H4');
select seed_util.seed_socket('Seltos','Facelift 2023+','Low Beam','H7');
select seed_util.seed_socket('Seltos','Facelift 2023+','Fog','H8');
select seed_util.seed_socket('Sonet','Facelift 2024+','Low Beam','H7');
select seed_util.seed_socket('Thar','2nd Gen 2020+','Low Beam','H4');
select seed_util.seed_socket('Scorpio N','2022+','Low Beam','H7');
select seed_util.seed_socket('XUV700','2021+','Low Beam','H7');
select seed_util.seed_socket('City','5th Gen 2020+','Low Beam','H11');
select seed_util.seed_socket('Venue','Facelift 2022+','Low Beam','H7');
select seed_util.seed_socket('i20','3rd Gen 2020+','Low Beam','H7');
