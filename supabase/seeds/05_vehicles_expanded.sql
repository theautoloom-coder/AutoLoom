-- =============================================================================
-- SEED 05 — the rest of the Indian vehicle master.
-- 03 lists what is on sale today. This file lists what is still on the road.
-- A 2011 Ritz or a 2009 Indica comes to the counter for mats, covers and bulbs
-- far more often than a brand new Victoris does, and a car that is not in the
-- master cannot be tagged on an item at all, so the dead nameplates earn their
-- rows as much as the launches do.
-- Years here are Indian years. A car that reached Europe in 2008 often reached
-- Noida in 2011, or never arrived. European generation numbers are ignored.
-- Where the exact facelift split was not certain the model gets ONE generation
-- covering its whole Indian run, because a wrong year range quietly sells
-- somebody the wrong part, while a wide one only makes the staff look twice.
-- Everything uncertain is listed in the comment block at the foot of the file.
-- Runs after 03, repeats nothing from it, and is safe to re-run.
-- =============================================================================

-- Body types stay inside the vocabulary 03 established — hatchback, sedan, suv,
-- muv, pickup — because the counter sorts by shape, not by RTO class, and a new
-- word here only makes the filter list longer. Vans (Omni, Traveller, Winger)
-- are filed as muv and the small commercials (Ace, Dost, Super Carry) as pickup.
-- The one exception is the electric three-wheelers at the foot of the file; see
-- the note there.

insert into public.vehicle_makes (name, code, sort_order) values
  ('Datsun',              'DAT', 25),
  ('Chevrolet',           'CHV', 26),
  ('Fiat',                'FIA', 27),
  ('Mitsubishi',          'MIT', 28),
  ('Hindustan Motors',    'HM',  29),
  ('BYD',                 'BYD', 30),
  ('Lexus',               'LEX', 31),
  ('Mini',                'MIN', 32),
  ('Jaguar',              'JAG', 33),
  ('Porsche',             'POR', 34),
  ('Ashok Leyland',       'ASL', 35),
  ('Mahindra Last Mile',  'MLM', 36)
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- Models + generations. year_to NULL means "still on sale".
-- Where a model already exists from 03 its original code is repeated verbatim:
-- the model table is unique on (make, code) as well as (make, name), so a fresh
-- code on an old model would collide instead of adding the generation.
-- -----------------------------------------------------------------------------

-- Maruti Suzuki --------------------------------------------------------------
-- The older gens first: 03 starts the Swift at 2011 and the WagonR at 2010, but
-- the ones before those are exactly the cars that come in for a re-trim.
select seed_util.seed_vehicle('Maruti Suzuki','Swift','SWIFT','hatchback','1st Gen 2005-2010', 2005, 2010);
select seed_util.seed_vehicle('Maruti Suzuki','WagonR','WAGONR','hatchback','1st Gen 1999-2010', 1999, 2010);
select seed_util.seed_vehicle('Maruti Suzuki','Alto','ALTO','hatchback','India 2000-2012',      2000, 2012);
select seed_util.seed_vehicle('Maruti Suzuki','Alto K10','ALTOK10','hatchback','India 2010-2014', 2010, 2014);
select seed_util.seed_vehicle('Maruti Suzuki','Dzire','DZIRE','sedan','1st Gen 2008-2012',      2008, 2012);
select seed_util.seed_vehicle('Maruti Suzuki','Celerio','CELERIO','hatchback','1st Gen 2014-2021', 2014, 2021);
select seed_util.seed_vehicle('Maruti Suzuki','Maruti 800','M800','hatchback','India 1983-2014', 1983, 2014);
select seed_util.seed_vehicle('Maruti Suzuki','Zen','ZEN','hatchback','India 1993-2006',        1993, 2006);
select seed_util.seed_vehicle('Maruti Suzuki','Zen Estilo','ESTILO','hatchback','India 2006-2013', 2006, 2013);
select seed_util.seed_vehicle('Maruti Suzuki','Esteem','ESTEEM','sedan','India 1994-2007',      1994, 2007);
select seed_util.seed_vehicle('Maruti Suzuki','Ritz','RITZ','hatchback','India 2009-2016',      2009, 2016);
select seed_util.seed_vehicle('Maruti Suzuki','A-Star','ASTAR','hatchback','India 2008-2014',   2008, 2014);
select seed_util.seed_vehicle('Maruti Suzuki','SX4','SX4','sedan','India 2007-2014',            2007, 2014);
select seed_util.seed_vehicle('Maruti Suzuki','Versa','VERSA','muv','India 2001-2010',          2001, 2010);
select seed_util.seed_vehicle('Maruti Suzuki','Omni','OMNI','muv','India 1984-2019',            1984, 2019);
select seed_util.seed_vehicle('Maruti Suzuki','Gypsy','GYPSY','suv','India 1985-2019',          1985, 2019);
select seed_util.seed_vehicle('Maruti Suzuki','S-Cross','SCROSS','suv','India 2015-2022',       2015, 2022);
select seed_util.seed_vehicle('Maruti Suzuki','Kizashi','KIZASHI','sedan','India 2011-2014',    2011, 2014);
-- The Stingray got its own grille, headlamps and bumper, so it is its own model
-- rather than a WagonR generation: a bumper part that fits one will not fit the other.
select seed_util.seed_vehicle('Maruti Suzuki','WagonR Stingray','STINGRAY','hatchback','India 2013-2017', 2013, 2017);
select seed_util.seed_vehicle('Maruti Suzuki','Super Carry','SCARRY','pickup','2016+',          2016, null);
select seed_util.seed_vehicle('Maruti Suzuki','Victoris','VICTORIS','suv','2025+',              2025, null);
select seed_util.seed_vehicle('Maruti Suzuki','e Vitara','EVITARA','suv','2025+',               2025, null);

-- Hyundai --------------------------------------------------------------------
-- 03 folds the whole i10 line into one model; these are the two runs before Nios.
select seed_util.seed_vehicle('Hyundai','i10','I10','hatchback','i10 2007-2013',          2007, 2013);
select seed_util.seed_vehicle('Hyundai','i10','I10','hatchback','Grand i10 2013-2019',    2013, 2019);
select seed_util.seed_vehicle('Hyundai','i20','I20','hatchback','1st Gen 2008-2014',      2008, 2014);
select seed_util.seed_vehicle('Hyundai','Verna','VERNA','sedan','India 2006-2011',        2006, 2011);
select seed_util.seed_vehicle('Hyundai','Verna','VERNA','sedan','Fluidic 2011-2017',      2011, 2017);
select seed_util.seed_vehicle('Hyundai','Santro','SANTRO','hatchback','India 1998-2014',  1998, 2014);
select seed_util.seed_vehicle('Hyundai','Tucson','TUCSON','suv','India 2016-2020',        2016, 2020);
select seed_util.seed_vehicle('Hyundai','Xcent','XCENT','sedan','India 2014-2019',        2014, 2019);
select seed_util.seed_vehicle('Hyundai','Eon','EON','hatchback','India 2011-2018',        2011, 2018);
select seed_util.seed_vehicle('Hyundai','Getz','GETZ','hatchback','India 2004-2009',      2004, 2009);
select seed_util.seed_vehicle('Hyundai','Accent','ACCENT','sedan','India 1999-2013',      1999, 2013);
select seed_util.seed_vehicle('Hyundai','Elantra','ELANTRA','sedan','India 2012-2016',    2012, 2016);
select seed_util.seed_vehicle('Hyundai','Elantra','ELANTRA','sedan','India 2016-2022',    2016, 2022);
select seed_util.seed_vehicle('Hyundai','i20 Active','I20ACTIVE','hatchback','India 2015-2020', 2015, 2020);
select seed_util.seed_vehicle('Hyundai','Santa Fe','SANTAFE','suv','India 2010-2017',     2010, 2017);
select seed_util.seed_vehicle('Hyundai','Sonata','SONATA','sedan','India 2001-2014',      2001, 2014);
select seed_util.seed_vehicle('Hyundai','Kona Electric','KONA','suv','India 2019-2023',   2019, 2023);
select seed_util.seed_vehicle('Hyundai','Ioniq 5','IONIQ5','suv','2023+',                 2023, null);
select seed_util.seed_vehicle('Hyundai','i20 N Line','I20NLINE','hatchback','2021+',      2021, null);
select seed_util.seed_vehicle('Hyundai','Creta N Line','CRETANL','suv','2024+',           2024, null);
select seed_util.seed_vehicle('Hyundai','Creta Electric','CRETAEV','suv','2025+',         2025, null);

-- Tata -----------------------------------------------------------------------
-- The old Safari is the same nameplate as the 2021 car, so it is a generation on
-- the existing model; the Storme is a different body and gets its own row.
select seed_util.seed_vehicle('Tata','Safari','SAFARI','suv','Dicor 1998-2012',      1998, 2012);
select seed_util.seed_vehicle('Tata','Safari Storme','STORME','suv','India 2012-2019', 2012, 2019);
select seed_util.seed_vehicle('Tata','Indica','INDICA','hatchback','India 1998-2018', 1998, 2018);
select seed_util.seed_vehicle('Tata','Indigo','INDIGO','sedan','India 2002-2018',     2002, 2018);
select seed_util.seed_vehicle('Tata','Zest','ZEST','sedan','India 2014-2020',         2014, 2020);
select seed_util.seed_vehicle('Tata','Bolt','BOLT','hatchback','India 2015-2019',     2015, 2019);
select seed_util.seed_vehicle('Tata','Hexa','HEXA','muv','India 2017-2020',           2017, 2020);
select seed_util.seed_vehicle('Tata','Sumo','SUMO','suv','India 1994-2019',           1994, 2019);
select seed_util.seed_vehicle('Tata','Nano','NANO','hatchback','India 2009-2018',     2009, 2018);
select seed_util.seed_vehicle('Tata','Manza','MANZA','sedan','India 2009-2016',       2009, 2016);
select seed_util.seed_vehicle('Tata','Aria','ARIA','muv','India 2010-2016',           2010, 2016);
select seed_util.seed_vehicle('Tata','Xenon','XENON','pickup','India 2009-2019',      2009, 2019);
select seed_util.seed_vehicle('Tata','Ace','ACE','pickup','India 2005+',              2005, null);
select seed_util.seed_vehicle('Tata','Intra','INTRA','pickup','2019+',                2019, null);
select seed_util.seed_vehicle('Tata','Yodha','YODHA','pickup','2017+',                2017, null);
select seed_util.seed_vehicle('Tata','Winger','WINGER','muv','India 2007+',           2007, null);
-- The EVs are separate models, not trims: the bumpers, grilles and lamp units
-- differ from the petrol car, so a fitment tagged "Nexon" must not claim them.
select seed_util.seed_vehicle('Tata','Nexon EV','NEXONEV','suv','India 2020-2023',    2020, 2023);
select seed_util.seed_vehicle('Tata','Nexon EV','NEXONEV','suv','Facelift 2023+',     2023, null, true);
select seed_util.seed_vehicle('Tata','Punch EV','PUNCHEV','suv','2024+',              2024, null);
select seed_util.seed_vehicle('Tata','Tiago EV','TIAGOEV','hatchback','2023+',        2023, null);
select seed_util.seed_vehicle('Tata','Tigor EV','TIGOREV','sedan','2021+',            2021, null);
select seed_util.seed_vehicle('Tata','Curvv EV','CURVVEV','suv','2024+',              2024, null);
select seed_util.seed_vehicle('Tata','Harrier EV','HARRIEREV','suv','2025+',          2025, null);
select seed_util.seed_vehicle('Tata','Sierra','SIERRA','suv','2025+',                 2025, null);

-- Mahindra -------------------------------------------------------------------
select seed_util.seed_vehicle('Mahindra','Thar','THAR','suv','CRDe 2010-2019',            2010, 2019);
select seed_util.seed_vehicle('Mahindra','Scorpio','SCORPIO','suv','1st Gen 2002-2014',   2002, 2014);
-- 03 already claims 2014+ for the Scorpio as "Classic"; the actual Scorpio Classic
-- badge is the 2022 restyle, so it goes in as its own generation rather than a fix.
select seed_util.seed_vehicle('Mahindra','Scorpio','SCORPIO','suv','Scorpio Classic 2022+', 2022, null);
select seed_util.seed_vehicle('Mahindra','XUV500','XUV500','suv','India 2011-2021',       2011, 2021);
select seed_util.seed_vehicle('Mahindra','KUV100','KUV100','suv','India 2016-2023',       2016, 2023);
select seed_util.seed_vehicle('Mahindra','TUV300','TUV300','suv','India 2015-2020',       2015, 2020);
select seed_util.seed_vehicle('Mahindra','Xylo','XYLO','muv','India 2009-2019',           2009, 2019);
select seed_util.seed_vehicle('Mahindra','Verito','VERITO','sedan','India 2011-2019',     2011, 2019);
select seed_util.seed_vehicle('Mahindra','Quanto','QUANTO','suv','India 2012-2016',       2012, 2016);
select seed_util.seed_vehicle('Mahindra','Alturas G4','ALTURAS','suv','India 2018-2022',  2018, 2022);
select seed_util.seed_vehicle('Mahindra','Bolero Camper','BOLEROCAMP','pickup','India 2007+', 2007, null);
select seed_util.seed_vehicle('Mahindra','Bolero Pik-Up','BOLEROPU','pickup','India 2007+',   2007, null);
select seed_util.seed_vehicle('Mahindra','Supro','SUPRO','muv','India 2015+',             2015, null);
select seed_util.seed_vehicle('Mahindra','Jeeto','JEETO','pickup','2015+',                2015, null);
select seed_util.seed_vehicle('Mahindra','XUV400 EV','XUV400','suv','2023+',              2023, null);
select seed_util.seed_vehicle('Mahindra','BE 6','BE6','suv','2025+',                      2025, null);
select seed_util.seed_vehicle('Mahindra','XEV 9e','XEV9E','suv','2025+',                  2025, null);

-- Kia ------------------------------------------------------------------------
select seed_util.seed_vehicle('Kia','Carnival','CARNIVAL','muv','New Gen 2024+', 2024, null);
select seed_util.seed_vehicle('Kia','Syros','SYROS','suv','2025+',               2025, null);
select seed_util.seed_vehicle('Kia','EV9','EV9','suv','2024+',                   2024, null);

-- Toyota ---------------------------------------------------------------------
select seed_util.seed_vehicle('Toyota','Fortuner','FORTUNER','suv','1st Gen 2009-2016', 2009, 2016);
-- 03 took the code INNOVA for the Crysta, so the pre-Crysta car carries INNOVA1.
-- The name is what staff search on; the code only has to stay unique per make.
select seed_util.seed_vehicle('Toyota','Innova','INNOVA1','muv','India 2005-2016',      2005, 2016);
select seed_util.seed_vehicle('Toyota','Qualis','QUALIS','muv','India 2000-2005',       2000, 2005);
select seed_util.seed_vehicle('Toyota','Etios','ETIOS','sedan','India 2010-2020',       2010, 2020);
select seed_util.seed_vehicle('Toyota','Etios Liva','LIVA','hatchback','India 2011-2020', 2011, 2020);
select seed_util.seed_vehicle('Toyota','Corolla','COROLLA','sedan','India 2003-2008',   2003, 2008);
select seed_util.seed_vehicle('Toyota','Corolla Altis','ALTIS','sedan','India 2008-2014', 2008, 2014);
select seed_util.seed_vehicle('Toyota','Corolla Altis','ALTIS','sedan','India 2014-2020', 2014, 2020);
select seed_util.seed_vehicle('Toyota','Camry','CAMRY','sedan','India 2002+',           2002, null);
select seed_util.seed_vehicle('Toyota','Yaris','YARIS','sedan','India 2018-2021',       2018, 2021);
select seed_util.seed_vehicle('Toyota','Urban Cruiser','URBANCRUISER','suv','India 2020-2022', 2020, 2022);
select seed_util.seed_vehicle('Toyota','Hilux','HILUX','pickup','2022+',                2022, null);
select seed_util.seed_vehicle('Toyota','Vellfire','VELLFIRE','muv','2020+',             2020, null);
select seed_util.seed_vehicle('Toyota','Land Cruiser','LANDCRUISER','suv','India 2009-2021', 2009, 2021);
select seed_util.seed_vehicle('Toyota','Land Cruiser','LANDCRUISER','suv','LC 300 2022+',    2022, null);
select seed_util.seed_vehicle('Toyota','Land Cruiser Prado','PRADO','suv','India 2010-2020', 2010, 2020);

-- Honda ----------------------------------------------------------------------
select seed_util.seed_vehicle('Honda','City','CITY','sedan','2nd Gen 2003-2008',    2003, 2008);
select seed_util.seed_vehicle('Honda','City','CITY','sedan','3rd Gen 2008-2014',    2008, 2014);
select seed_util.seed_vehicle('Honda','Amaze','AMAZE','sedan','1st Gen 2013-2018',  2013, 2018);
select seed_util.seed_vehicle('Honda','Jazz','JAZZ','hatchback','1st Gen 2009-2013', 2009, 2013);
select seed_util.seed_vehicle('Honda','Brio','BRIO','hatchback','India 2011-2016',  2011, 2016);
select seed_util.seed_vehicle('Honda','Mobilio','MOBILIO','muv','India 2014-2017',  2014, 2017);
select seed_util.seed_vehicle('Honda','BR-V','BRV','suv','India 2016-2020',         2016, 2020);
-- The Civic left India in 2012 and came back for two years in 2019; one row each,
-- because nothing off the old car fits the new one.
select seed_util.seed_vehicle('Honda','Civic','CIVIC','sedan','India 2006-2012',    2006, 2012);
select seed_util.seed_vehicle('Honda','Civic','CIVIC','sedan','India 2019-2020',    2019, 2020);
select seed_util.seed_vehicle('Honda','CR-V','CRV','suv','India 2003-2020',         2003, 2020);
select seed_util.seed_vehicle('Honda','Accord','ACCORD','sedan','India 2001-2020',  2001, 2020);

-- MG -------------------------------------------------------------------------
select seed_util.seed_vehicle('MG','ZS EV','ZSEV','suv','2020+',              2020, null);
select seed_util.seed_vehicle('MG','Hector Plus','HECTORPLUS','suv','2020+',  2020, null);
select seed_util.seed_vehicle('MG','Majestor','MAJESTOR','suv','2025+',       2025, null);
select seed_util.seed_vehicle('MG','M9','M9','muv','2025+',                   2025, null);

-- Renault --------------------------------------------------------------------
select seed_util.seed_vehicle('Renault','Captur','CAPTUR','suv','India 2017-2020',     2017, 2020);
select seed_util.seed_vehicle('Renault','Lodgy','LODGY','muv','India 2015-2020',       2015, 2020);
select seed_util.seed_vehicle('Renault','Scala','SCALA','sedan','India 2012-2017',     2012, 2017);
select seed_util.seed_vehicle('Renault','Pulse','PULSE','hatchback','India 2012-2017', 2012, 2017);
select seed_util.seed_vehicle('Renault','Fluence','FLUENCE','sedan','India 2011-2016', 2011, 2016);
select seed_util.seed_vehicle('Renault','Koleos','KOLEOS','suv','India 2011-2016',     2011, 2016);

-- Nissan ---------------------------------------------------------------------
select seed_util.seed_vehicle('Nissan','Micra','MICRA','hatchback','India 2010-2020', 2010, 2020);
select seed_util.seed_vehicle('Nissan','Sunny','SUNNY','sedan','India 2011-2019',     2011, 2019);
select seed_util.seed_vehicle('Nissan','Terrano','TERRANO','suv','India 2013-2020',   2013, 2020);
select seed_util.seed_vehicle('Nissan','Kicks','KICKS','suv','India 2019-2022',       2019, 2022);
select seed_util.seed_vehicle('Nissan','Evalia','EVALIA','muv','India 2012-2016',     2012, 2016);
select seed_util.seed_vehicle('Nissan','X-Trail','XTRAIL','suv','India 2005-2014',    2005, 2014);
select seed_util.seed_vehicle('Nissan','X-Trail','XTRAIL','suv','2023+',              2023, null);

-- Volkswagen -----------------------------------------------------------------
select seed_util.seed_vehicle('Volkswagen','Vento','VENTO','sedan','India 2010-2022', 2010, 2022);
select seed_util.seed_vehicle('Volkswagen','Ameo','AMEO','sedan','India 2016-2020',   2016, 2020);
select seed_util.seed_vehicle('Volkswagen','Jetta','JETTA','sedan','India 2008-2017', 2008, 2017);
select seed_util.seed_vehicle('Volkswagen','Passat','PASSAT','sedan','India 2017-2020', 2017, 2020);
select seed_util.seed_vehicle('Volkswagen','Tiguan','TIGUAN','suv','India 2017-2020', 2017, 2020);
select seed_util.seed_vehicle('Volkswagen','Tiguan','TIGUAN','suv','Allspace 2020+',  2020, null);
select seed_util.seed_vehicle('Volkswagen','T-Roc','TROC','suv','India 2020-2022',    2020, 2022);

-- Skoda ----------------------------------------------------------------------
-- The Laura was sold alongside the name Octavia in India, so it keeps its own row
-- the way the showroom sold it, not the way Skoda numbers its generations.
select seed_util.seed_vehicle('Skoda','Octavia','OCTAVIA','sedan','India 2001-2010', 2001, 2010);
select seed_util.seed_vehicle('Skoda','Octavia','OCTAVIA','sedan','3rd Gen 2013-2020', 2013, 2020);
select seed_util.seed_vehicle('Skoda','Octavia','OCTAVIA','sedan','4th Gen 2021+',   2021, null);
select seed_util.seed_vehicle('Skoda','Laura','LAURA','sedan','India 2005-2013',     2005, 2013);
select seed_util.seed_vehicle('Skoda','Superb','SUPERB','sedan','India 2009-2020',   2009, 2020);
select seed_util.seed_vehicle('Skoda','Superb','SUPERB','sedan','CBU 2023+',         2023, null);
select seed_util.seed_vehicle('Skoda','Fabia','FABIA','hatchback','India 2008-2013', 2008, 2013);
select seed_util.seed_vehicle('Skoda','Yeti','YETI','suv','India 2010-2017',         2010, 2017);
select seed_util.seed_vehicle('Skoda','Kodiaq','KODIAQ','suv','India 2017+',         2017, null);

-- Ford -----------------------------------------------------------------------
select seed_util.seed_vehicle('Ford','Endeavour','ENDEAVOUR','suv','India 2003-2015',  2003, 2015);
select seed_util.seed_vehicle('Ford','Endeavour','ENDEAVOUR','suv','3rd Gen 2016-2021', 2016, 2021);
select seed_util.seed_vehicle('Ford','Fiesta','FIESTA','sedan','Classic 2005-2011',    2005, 2011);
select seed_util.seed_vehicle('Ford','Fiesta','FIESTA','sedan','India 2011-2015',      2011, 2015);
select seed_util.seed_vehicle('Ford','Ikon','IKON','sedan','India 1999-2011',          1999, 2011);
select seed_util.seed_vehicle('Ford','Aspire','ASPIRE','sedan','India 2015-2021',      2015, 2021);
select seed_util.seed_vehicle('Ford','Freestyle','FREESTYLE','hatchback','India 2018-2021', 2018, 2021);

-- Citroen --------------------------------------------------------------------
select seed_util.seed_vehicle('Citroen','eC3','EC3','hatchback','2023+',           2023, null);
select seed_util.seed_vehicle('Citroen','Basalt','BASALT','suv','2024+',           2024, null);
select seed_util.seed_vehicle('Citroen','C3 Aircross','C3AIRCROSS','suv','2023+',  2023, null);
select seed_util.seed_vehicle('Citroen','C5 Aircross','C5AIRCROSS','suv','India 2021+', 2021, null);

-- Jeep -----------------------------------------------------------------------
-- The Wrangler and Grand Cherokee arrived as imports and later came off the Ranjangaon
-- line; the body did not change enough to sell different parts, so one row each.
select seed_util.seed_vehicle('Jeep','Wrangler','WRANGLER','suv','India 2016+',              2016, null);
select seed_util.seed_vehicle('Jeep','Grand Cherokee','GRANDCHEROKEE','suv','India 2016+',   2016, null);
select seed_util.seed_vehicle('Jeep','Meridian','MERIDIAN','suv','2022+',                    2022, null);

-- Isuzu ----------------------------------------------------------------------
select seed_util.seed_vehicle('Isuzu','MU-X','MUX','suv','India 2017+', 2017, null);

-- Force ----------------------------------------------------------------------
-- Every second school van and staff shuttle in Noida is a Traveller, and they go
-- through seat covers and roof lamps faster than anything a private owner buys.
select seed_util.seed_vehicle('Force','Traveller','TRAVELLER','muv','India 2000+', 2000, null);
select seed_util.seed_vehicle('Force','Urbania','URBANIA','muv','2023+',           2023, null);

-- Datsun ---------------------------------------------------------------------
-- Dead brand, live cars: the GO family was sold cheap and in volume until 2022.
select seed_util.seed_vehicle('Datsun','GO','GO','hatchback','India 2014-2022',       2014, 2022);
select seed_util.seed_vehicle('Datsun','GO+','GOPLUS','muv','India 2015-2022',        2015, 2022);
select seed_util.seed_vehicle('Datsun','redi-GO','REDIGO','hatchback','India 2016-2022', 2016, 2022);

-- Chevrolet ------------------------------------------------------------------
-- GM left India in 2017 and the dealer network went with it, which is exactly why
-- these owners end up at an independent accessories counter.
select seed_util.seed_vehicle('Chevrolet','Beat','BEAT','hatchback','India 2010-2017',  2010, 2017);
select seed_util.seed_vehicle('Chevrolet','Spark','SPARK','hatchback','India 2007-2013', 2007, 2013);
select seed_util.seed_vehicle('Chevrolet','Sail','SAIL','sedan','India 2012-2017',      2012, 2017);
select seed_util.seed_vehicle('Chevrolet','Cruze','CRUZE','sedan','India 2009-2017',    2009, 2017);
select seed_util.seed_vehicle('Chevrolet','Optra','OPTRA','sedan','India 2003-2010',    2003, 2010);
select seed_util.seed_vehicle('Chevrolet','Aveo','AVEO','sedan','India 2006-2011',      2006, 2011);
select seed_util.seed_vehicle('Chevrolet','Tavera','TAVERA','muv','India 2004-2017',    2004, 2017);
select seed_util.seed_vehicle('Chevrolet','Enjoy','ENJOY','muv','India 2013-2017',      2013, 2017);
select seed_util.seed_vehicle('Chevrolet','Captiva','CAPTIVA','suv','India 2007-2015',  2007, 2015);
select seed_util.seed_vehicle('Chevrolet','Trailblazer','TRAILBLAZER','suv','India 2015-2017', 2015, 2017);

-- Fiat -----------------------------------------------------------------------
select seed_util.seed_vehicle('Fiat','Palio','PALIO','hatchback','India 1999-2009',     1999, 2009);
select seed_util.seed_vehicle('Fiat','Punto','PUNTO','hatchback','India 2009-2019',     2009, 2019);
select seed_util.seed_vehicle('Fiat','Linea','LINEA','sedan','India 2009-2018',         2009, 2018);
select seed_util.seed_vehicle('Fiat','Avventura','AVVENTURA','hatchback','India 2014-2019', 2014, 2019);

-- Mitsubishi -----------------------------------------------------------------
select seed_util.seed_vehicle('Mitsubishi','Lancer','LANCER','sedan','India 1998-2012',        1998, 2012);
select seed_util.seed_vehicle('Mitsubishi','Cedia','CEDIA','sedan','India 2006-2013',          2006, 2013);
select seed_util.seed_vehicle('Mitsubishi','Pajero','PAJERO','suv','India 2002-2012',          2002, 2012);
select seed_util.seed_vehicle('Mitsubishi','Pajero Sport','PAJEROSPORT','suv','India 2012-2020', 2012, 2020);
select seed_util.seed_vehicle('Mitsubishi','Outlander','OUTLANDER','suv','India 2009-2017',    2009, 2017);

-- Hindustan Motors -----------------------------------------------------------
-- One model, sixty years, and still a steady trade in seat covers and mats.
select seed_util.seed_vehicle('Hindustan Motors','Ambassador','AMBASSADOR','sedan','India 1958-2014', 1958, 2014);

-- BYD ------------------------------------------------------------------------
select seed_util.seed_vehicle('BYD','e6','E6','muv','India 2021+',       2021, null);
select seed_util.seed_vehicle('BYD','Atto 3','ATTO3','suv','2022+',      2022, null);
select seed_util.seed_vehicle('BYD','Seal','SEAL','sedan','2024+',       2024, null);
select seed_util.seed_vehicle('BYD','eMAX 7','EMAX7','muv','2024+',      2024, null);
select seed_util.seed_vehicle('BYD','Sealion 7','SEALION7','suv','2025+', 2025, null);

-- Lexus, Mini, Jaguar, Porsche -----------------------------------------------
-- The imported brands get one generation per nameplate on purpose. Their Indian
-- runs are short, the facelift dates here rarely match the factory ones, and the
-- shop sells them mats and films rather than body parts, so a wide range is safe
-- and a guessed split would not be.
select seed_util.seed_vehicle('Lexus','ES','ES','sedan','India 2018+',   2018, null);
select seed_util.seed_vehicle('Lexus','NX','NX','suv','India 2022+',     2022, null);
select seed_util.seed_vehicle('Lexus','RX','RX','suv','India 2023+',     2023, null);
select seed_util.seed_vehicle('Lexus','LX','LX','suv','India 2022+',     2022, null);
select seed_util.seed_vehicle('Lexus','LM','LM','muv','India 2023+',     2023, null);
select seed_util.seed_vehicle('Mini','Cooper','COOPER','hatchback','India 2012+',     2012, null);
select seed_util.seed_vehicle('Mini','Countryman','COUNTRYMAN','suv','India 2013+',   2013, null);
select seed_util.seed_vehicle('Jaguar','XE','XE','sedan','India 2016-2021',  2016, 2021);
select seed_util.seed_vehicle('Jaguar','XF','XF','sedan','India 2009-2021',  2009, 2021);
select seed_util.seed_vehicle('Jaguar','XJ','XJ','sedan','India 2010-2019',  2010, 2019);
select seed_util.seed_vehicle('Jaguar','F-Pace','FPACE','suv','India 2016+', 2016, null);
select seed_util.seed_vehicle('Porsche','Cayenne','CAYENNE','suv','India 2004+',    2004, null);
select seed_util.seed_vehicle('Porsche','Macan','MACAN','suv','India 2014+',        2014, null);
select seed_util.seed_vehicle('Porsche','Panamera','PANAMERA','sedan','India 2010+', 2010, null);
select seed_util.seed_vehicle('Porsche','Taycan','TAYCAN','sedan','India 2021+',    2021, null);

-- BMW ------------------------------------------------------------------------
-- 03 created the German makes but left them empty, so every row below is new.
-- Only the splits that are common knowledge at an Indian counter are split.
select seed_util.seed_vehicle('BMW','3 Series','SERIES3','sedan','F30 2012-2019', 2012, 2019);
select seed_util.seed_vehicle('BMW','3 Series','SERIES3','sedan','G20 2019+',     2019, null);
select seed_util.seed_vehicle('BMW','5 Series','SERIES5','sedan','F10 2010-2017', 2010, 2017);
select seed_util.seed_vehicle('BMW','5 Series','SERIES5','sedan','G30 2017-2024', 2017, 2024);
select seed_util.seed_vehicle('BMW','5 Series','SERIES5','sedan','G60 2024+',     2024, null);
select seed_util.seed_vehicle('BMW','7 Series','SERIES7','sedan','India 2009-2022', 2009, 2022);
select seed_util.seed_vehicle('BMW','7 Series','SERIES7','sedan','G70 2023+',     2023, null);
select seed_util.seed_vehicle('BMW','2 Series Gran Coupe','SERIES2','sedan','India 2020+', 2020, null);
select seed_util.seed_vehicle('BMW','X1','X1','suv','India 2010-2016',  2010, 2016);
select seed_util.seed_vehicle('BMW','X1','X1','suv','India 2016-2022',  2016, 2022);
select seed_util.seed_vehicle('BMW','X1','X1','suv','India 2023+',      2023, null);
select seed_util.seed_vehicle('BMW','X3','X3','suv','India 2011-2018',  2011, 2018);
select seed_util.seed_vehicle('BMW','X3','X3','suv','India 2018+',      2018, null);
select seed_util.seed_vehicle('BMW','X5','X5','suv','India 2007+',      2007, null);
select seed_util.seed_vehicle('BMW','X7','X7','suv','India 2019+',      2019, null);
select seed_util.seed_vehicle('BMW','iX1','IX1','suv','India 2023+',    2023, null);

-- Mercedes-Benz --------------------------------------------------------------
select seed_util.seed_vehicle('Mercedes-Benz','C-Class','CCLASS','sedan','W205 2015-2022', 2015, 2022);
select seed_util.seed_vehicle('Mercedes-Benz','C-Class','CCLASS','sedan','W206 2022+',     2022, null);
select seed_util.seed_vehicle('Mercedes-Benz','E-Class','ECLASS','sedan','W213 2017-2024', 2017, 2024);
select seed_util.seed_vehicle('Mercedes-Benz','E-Class','ECLASS','sedan','W214 2024+',     2024, null);
select seed_util.seed_vehicle('Mercedes-Benz','S-Class','SCLASS','sedan','W222 2014-2021', 2014, 2021);
select seed_util.seed_vehicle('Mercedes-Benz','S-Class','SCLASS','sedan','W223 2021+',     2021, null);
select seed_util.seed_vehicle('Mercedes-Benz','A-Class Limousine','ACLASS','sedan','India 2021+', 2021, null);
select seed_util.seed_vehicle('Mercedes-Benz','GLA','GLA','suv','India 2014-2020',  2014, 2020);
select seed_util.seed_vehicle('Mercedes-Benz','GLA','GLA','suv','India 2021+',      2021, null);
select seed_util.seed_vehicle('Mercedes-Benz','GLC','GLC','suv','India 2016-2022',  2016, 2022);
select seed_util.seed_vehicle('Mercedes-Benz','GLC','GLC','suv','India 2023+',      2023, null);
select seed_util.seed_vehicle('Mercedes-Benz','GLE','GLE','suv','India 2015+',      2015, null);
select seed_util.seed_vehicle('Mercedes-Benz','GLS','GLS','suv','India 2016+',      2016, null);
select seed_util.seed_vehicle('Mercedes-Benz','G-Class','GCLASS','suv','India 2018+', 2018, null);
select seed_util.seed_vehicle('Mercedes-Benz','EQS','EQS','sedan','India 2022+',    2022, null);

-- Audi -----------------------------------------------------------------------
select seed_util.seed_vehicle('Audi','A3','A3','sedan','India 2014-2020',  2014, 2020);
select seed_util.seed_vehicle('Audi','A4','A4','sedan','India 2008-2016',  2008, 2016);
select seed_util.seed_vehicle('Audi','A4','A4','sedan','B9 2016+',         2016, null);
select seed_util.seed_vehicle('Audi','A6','A6','sedan','India 2011-2019',  2011, 2019);
select seed_util.seed_vehicle('Audi','A6','A6','sedan','C8 2019+',         2019, null);
select seed_util.seed_vehicle('Audi','A8 L','A8','sedan','India 2011+',    2011, null);
select seed_util.seed_vehicle('Audi','Q3','Q3','suv','India 2012-2019',    2012, 2019);
select seed_util.seed_vehicle('Audi','Q3','Q3','suv','India 2022+',        2022, null);
select seed_util.seed_vehicle('Audi','Q5','Q5','suv','India 2009-2018',    2009, 2018);
select seed_util.seed_vehicle('Audi','Q5','Q5','suv','India 2018+',        2018, null);
select seed_util.seed_vehicle('Audi','Q7','Q7','suv','India 2006-2015',    2006, 2015);
select seed_util.seed_vehicle('Audi','Q7','Q7','suv','India 2015+',        2015, null);
select seed_util.seed_vehicle('Audi','Q8','Q8','suv','India 2020+',        2020, null);
select seed_util.seed_vehicle('Audi','e-tron','ETRON','suv','India 2021+', 2021, null);

-- Volvo ----------------------------------------------------------------------
select seed_util.seed_vehicle('Volvo','S60','S60','sedan','India 2011+',        2011, null);
select seed_util.seed_vehicle('Volvo','S90','S90','sedan','India 2016+',        2016, null);
select seed_util.seed_vehicle('Volvo','XC40','XC40','suv','India 2018+',        2018, null);
select seed_util.seed_vehicle('Volvo','XC60','XC60','suv','India 2017+',        2017, null);
select seed_util.seed_vehicle('Volvo','XC90','XC90','suv','India 2015+',        2015, null);
select seed_util.seed_vehicle('Volvo','C40 Recharge','C40','suv','India 2022+', 2022, null);

-- Land Rover -----------------------------------------------------------------
select seed_util.seed_vehicle('Land Rover','Range Rover','RANGEROVER','suv','India 2013+',        2013, null);
select seed_util.seed_vehicle('Land Rover','Range Rover Sport','RRSPORT','suv','India 2013+',     2013, null);
select seed_util.seed_vehicle('Land Rover','Range Rover Evoque','EVOQUE','suv','India 2011+',     2011, null);
select seed_util.seed_vehicle('Land Rover','Range Rover Velar','VELAR','suv','India 2017+',       2017, null);
select seed_util.seed_vehicle('Land Rover','Discovery','DISCOVERY','suv','India 2017+',           2017, null);
select seed_util.seed_vehicle('Land Rover','Discovery Sport','DISCOSPORT','suv','India 2015+',    2015, null);
select seed_util.seed_vehicle('Land Rover','Defender','DEFENDER','suv','India 2020+',             2020, null);

-- Ashok Leyland --------------------------------------------------------------
-- Small commercials are here because the shop already sells them seat covers,
-- floor mats and work lamps; the heavy trucks are deliberately left out.
select seed_util.seed_vehicle('Ashok Leyland','Dost','DOST','pickup','India 2011+',      2011, null);
select seed_util.seed_vehicle('Ashok Leyland','Bada Dost','BADADOST','pickup','2020+',   2020, null);
select seed_util.seed_vehicle('Ashok Leyland','Partner','PARTNER','pickup','India 2017+', 2017, null);

-- Mahindra Last Mile ---------------------------------------------------------
-- The e-rickshaws get a body type of their own. Calling a Treo an MUV would put
-- it in front of staff looking for car mats, and calling it a pickup would be a
-- lie; it sells seat covers, hood covers and lamps, so it belongs in the master.
select seed_util.seed_vehicle('Mahindra Last Mile','Treo','TREO','three-wheeler','India 2018+',      2018, null);
select seed_util.seed_vehicle('Mahindra Last Mile','Treo Zor','TREOZOR','three-wheeler','2020+',     2020, null);
select seed_util.seed_vehicle('Mahindra Last Mile','e-Alfa Mini','EALFAMINI','three-wheeler','India 2018+', 2018, null);

-- -----------------------------------------------------------------------------
-- Search aliases, same idea as 03: the name on the bonnet is rarely the name the
-- customer says out loud.
-- -----------------------------------------------------------------------------
insert into public.vehicle_model_aliases (model_id, alias)
select vm.id, a.alias
from (values
  ('Zen Estilo','Estilo'), ('WagonR Stingray','Stingray'),
  ('Maruti 800','800'), ('Maruti 800','M800'),
  ('Super Carry','Supercarry'), ('e Vitara','eVitara'), ('e Vitara','E Vitara'),
  ('i20 Active','Active i20'), ('i20 N Line','i20 NLine'),
  ('Creta N Line','Creta NLine'), ('Creta Electric','Creta EV'),
  ('Kona Electric','Kona'), ('Ioniq 5','Ioniq'),
  ('Safari Storme','Storme'), ('Nexon EV','Nexon Electric'),
  ('Tigor EV','Tigor Electric'), ('Tiago EV','Tiago Electric'),
  ('Punch EV','Punch Electric'), ('Curvv EV','Curvv Electric'),
  ('Harrier EV','Harrier Electric'),
  ('XUV400 EV','XUV400'), ('BE 6','BE6'), ('XEV 9e','XEV9e'),
  ('Alturas G4','Alturas'), ('Bolero Camper','Camper'), ('Bolero Pik-Up','Pikup'),
  ('Innova','Old Innova'), ('Corolla Altis','Altis'),
  ('Land Cruiser Prado','Prado'), ('Etios Liva','Liva'),
  ('Urban Cruiser','Urban Cruiser 2020'),
  ('BR-V','BRV'), ('CR-V','CRV'),
  ('Hector Plus','Hector+'), ('ZS EV','ZS'),
  ('C3 Aircross','Aircross'), ('eC3','e-C3'), ('eC3','E C3'),
  ('C5 Aircross','C5'), ('Grand Cherokee','Cherokee'),
  ('MU-X','MUX'), ('redi-GO','Redigo'), ('GO+','GO Plus'),
  ('Pajero Sport','Pajero Sports'), ('Ambassador','Amby'),
  ('Atto 3','Atto'), ('eMAX 7','eMAX'), ('Sealion 7','Sealion'),
  ('Bada Dost','Badadost'), ('Treo Zor','Zor'),
  ('3 Series','320d'), ('5 Series','530d'),
  ('A8 L','A8'), ('C40 Recharge','C40'),
  ('Range Rover Evoque','Evoque'), ('Range Rover Velar','Velar'),
  ('Range Rover Sport','RR Sport'), ('Discovery Sport','Disco Sport')
) as a(model, alias)
join public.vehicle_models vm on vm.name = a.model
on conflict (model_id, alias) do nothing;

-- =============================================================================
-- DOUBTS — every row above that I was less than sure of, and why.
-- Check these against a real car or a dealer before a fitment is tagged to them.
--
-- Launch years I could not pin to a month, so the year may be out by one:
--   Maruti 800 'India 1983-2014'   — 1983 is the launch, but production ran on in
--                                    small numbers; 2014 is the end I am confident of.
--   Omni 'India 1984-2019'         — long unbroken run, several quiet updates I did
--                                    not split because the body barely moved.
--   Gypsy 'India 1985-2019'        — civilian sales stopped earlier than army supply.
--   Tata Ace 'India 2005+'         — still made, but the Ace Gold/EV split is not here.
--   Tata Sumo 'India 1994-2019'    — Spacio, Grande and Gold are all inside this one
--                                    range; they are different bodies and should be
--                                    split once somebody can confirm the dates.
--   Mahindra Bolero Camper / Pik-Up 'India 2007+' — both are roughly mid-2000s; the
--                                    2007 start is my best guess, not a known date.
--   Mahindra Supro 'India 2015+'   — launch year confident, current status not.
--   Force Traveller 'India 2000+'  — sold far longer than that under earlier names.
--   Ashok Leyland Partner 'India 2017+' — launch year is approximate.
--   Mahindra Last Mile e-Alfa Mini 'India 2018+' — approximate; the Last Mile brand
--                                    itself was carved out later than the product.
--
-- 2025 launches I believe happened but have not seen a car of:
--   Maruti Victoris 2025+, Maruti e Vitara 2025+, Tata Sierra 2025+,
--   Tata Harrier EV 2025+, Mahindra BE 6 2025+, Mahindra XEV 9e 2025+,
--   MG Majestor 2025+, MG M9 2025+, BYD Sealion 7 2025+, Kia Syros 2025+.
--   If any of these slipped, the row is harmless but the year is wrong.
--
-- Deliberately ONE generation where the real car had more, because I could not
-- place the split with confidence:
--   Honda CR-V 'India 2003-2020'      — four generations came here; dates unclear.
--   Honda Accord 'India 2001-2020'    — includes the hybrid that returned in 2016.
--   Toyota Camry 'India 2002+'        — many generations, several hybrid changes.
--   Mahindra XUV500 'India 2011-2021' — the 2015 and 2018 restyles are not split.
--   Skoda Kodiaq 'India 2017+'        — a newer generation exists; I did not date it.
--   Tata Indica / Indigo              — V2, CS, eV2, eCS all folded into one range.
--   Hyundai Accent 'India 1999-2013'  — taxi-spec Executive ran past the retail car.
--   Hyundai Sonata 'India 2001-2014'  — sold in bursts, not continuously. Least
--                                       trustworthy row in the Hyundai block.
--   BMW X5 'India 2007+'              — start year and generation splits both soft.
--   All Lexus / Mini / Jaguar / Porsche / Volvo / Land Rover rows — single wide
--     Indian ranges on purpose; treat the start year as approximate.
--
-- Facelift rows I did split and am confident about, listed so they are easy to
-- re-check anyway: Tata Nexon EV 2023, BMW 3 Series F30/G20, BMW 5 Series G30/G60,
-- Mercedes C-Class W205/W206, E-Class W213/W214, S-Class W222/W223.
--
-- Discontinuation years that may be a year late or early:
--   Hyundai Kona Electric 2023, Nissan Kicks 2022, VW T-Roc 2022,
--   Jaguar XF 2021, Skoda Octavia '4th Gen 2021+' (it may already be off sale),
--   VW Tiguan 'Allspace 2020+' (likewise), Skoda Superb 'CBU 2023+'.
--
-- Left OUT because I could not confirm they were sold in India at all, or in what
-- years — add them by hand if the shop sees one:
--   Skoda Enyaq (an India launch was announced; I could not confirm it happened).
--   Force Trax (certainly sold, dates unknown).
--   Mahindra e2o / e2o Plus, Mahindra Zor Grand.
--   Toyota Prius, Toyota bZ4X, Hyundai i30, Hyundai Terracan.
--   Porsche 911 and other coupes/roadsters — also no honest body_type for them
--     in the vocabulary 03 set, and the counter does not stock for them.
--   The old Tata Sierra (1991-2000) — the 2025 row above is the new car only.
--   The old Maruti Baleno sedan (1999-2007) — the name now belongs to the
--     hatchback in 03, and two models cannot share a name under one make.
--   Chevrolet Forester, Daewoo Matiz, Premier Rio, Opel Astra/Corsa — all real
--     Indian cars, all too rare now to be worth a guessed year range.
-- =============================================================================

-- =============================================================================
-- TRIM — cars nobody buys accessories for any more.
--
-- The owner's rule, and he is right: parts for a dead car do not sell, and
-- every one of them is a row somebody has to scroll past while a customer
-- waits. The cutoff is 2015 — a car still on sale that year is at most about
-- eleven years old today, which is still well inside the age where people buy
-- mats, seat covers and bulbs.
--
-- It cuts both ways:
--   * a MODEL goes if its newest generation ended before 2015 (Maruti 800,
--     Zen, Esteem, Qualis, Ambassador, Lancer, Pajero, Getz, Palio);
--   * a GENERATION goes if it ended before 2015 even when the model lives on,
--     so Swift keeps 2011+ but loses 2005-2010.
--
-- What stays and might look old: Omni, Gypsy, Ritz, Indica, Beat, Datsun GO.
-- All of them sold into 2017-2020 and all of them are still on Noida roads.
--
-- Deletes cascade to fitments, so run this before tagging products, not after.
-- =============================================================================

delete from public.vehicle_generations g
 where coalesce(g.year_to, 9999) < 2015
   and exists (
     select 1 from public.vehicle_generations g2
      where g2.model_id = g.model_id and coalesce(g2.year_to, 9999) >= 2015
   );

delete from public.vehicle_models vm
 where not exists (
   select 1 from public.vehicle_generations g
    where g.model_id = vm.id and coalesce(g.year_to, 9999) >= 2015
 );

-- Hindustan Motors only ever had the Ambassador, which the trim above removed,
-- so the make is now an empty heading in every picker. Any make left with no
-- models goes the same way.
delete from public.vehicle_makes mk
 where not exists (select 1 from public.vehicle_models vm where vm.make_id = mk.id);
