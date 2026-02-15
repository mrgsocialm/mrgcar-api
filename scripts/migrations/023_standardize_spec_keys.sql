-- Migration 023: Standardize specification keys from Turkish to English
-- This migration converts existing Turkish specification keys in the cars.data JSONB column
-- to standardized English keys for consistency across bot, admin panel, and Flutter app.

-- Helper function to rename a key within the specifications JSONB object
-- Only renames if the old key exists and the new key does NOT already exist
CREATE OR REPLACE FUNCTION _rename_spec_key(data jsonb, old_key text, new_key text) RETURNS jsonb AS $$
BEGIN
  IF data->'specifications' ? old_key AND NOT (data->'specifications' ? new_key) THEN
    RETURN jsonb_set(
      data,
      '{specifications}',
      (data->'specifications' - old_key) || jsonb_build_object(new_key, data->'specifications'->old_key)
    );
  END IF;
  RETURN data;
END;
$$ LANGUAGE plpgsql;

-- Apply all key renames to the cars table
UPDATE cars SET data = _rename_spec_key(data, 'Motor Kodu', 'engine') WHERE data->'specifications' ? 'Motor Kodu';
UPDATE cars SET data = _rename_spec_key(data, 'Motor Tipi', 'engine') WHERE data->'specifications' ? 'Motor Tipi';
UPDATE cars SET data = _rename_spec_key(data, 'Motor Hacmi', 'engineCapacity') WHERE data->'specifications' ? 'Motor Hacmi';
UPDATE cars SET data = _rename_spec_key(data, 'Silindir Sayısı', 'cylinders') WHERE data->'specifications' ? 'Silindir Sayısı';
UPDATE cars SET data = _rename_spec_key(data, 'Supap Sayısı', 'valves') WHERE data->'specifications' ? 'Supap Sayısı';
UPDATE cars SET data = _rename_spec_key(data, 'Güç', 'power') WHERE data->'specifications' ? 'Güç';
UPDATE cars SET data = _rename_spec_key(data, 'Tork', 'torque') WHERE data->'specifications' ? 'Tork';
UPDATE cars SET data = _rename_spec_key(data, 'Şanzıman', 'transmission') WHERE data->'specifications' ? 'Şanzıman';
UPDATE cars SET data = _rename_spec_key(data, 'Sürüş Tipi', 'drivetrain') WHERE data->'specifications' ? 'Sürüş Tipi';
UPDATE cars SET data = _rename_spec_key(data, 'Yakıt Tipi', 'fuelType') WHERE data->'specifications' ? 'Yakıt Tipi';
UPDATE cars SET data = _rename_spec_key(data, 'Yakıt Deposu', 'fuelCapacity') WHERE data->'specifications' ? 'Yakıt Deposu';
UPDATE cars SET data = _rename_spec_key(data, '0-100 km/s', 'acceleration') WHERE data->'specifications' ? '0-100 km/s';
UPDATE cars SET data = _rename_spec_key(data, 'Maks. Hız', 'topSpeed') WHERE data->'specifications' ? 'Maks. Hız';
UPDATE cars SET data = _rename_spec_key(data, 'Yakıt Tüketimi (Şehir)', 'cityFuel') WHERE data->'specifications' ? 'Yakıt Tüketimi (Şehir)';
UPDATE cars SET data = _rename_spec_key(data, 'Yakıt Tüketimi (Yol)', 'highwayFuel') WHERE data->'specifications' ? 'Yakıt Tüketimi (Yol)';
UPDATE cars SET data = _rename_spec_key(data, 'Yakıt Tüketimi (Karma)', 'combinedFuel') WHERE data->'specifications' ? 'Yakıt Tüketimi (Karma)';
UPDATE cars SET data = _rename_spec_key(data, 'Uzunluk', 'length') WHERE data->'specifications' ? 'Uzunluk';
UPDATE cars SET data = _rename_spec_key(data, 'Genişlik', 'width') WHERE data->'specifications' ? 'Genişlik';
UPDATE cars SET data = _rename_spec_key(data, 'Yükseklik', 'height') WHERE data->'specifications' ? 'Yükseklik';
UPDATE cars SET data = _rename_spec_key(data, 'Aks Mesafesi', 'wheelbase') WHERE data->'specifications' ? 'Aks Mesafesi';
UPDATE cars SET data = _rename_spec_key(data, 'Bagaj Hacmi', 'trunkCapacity') WHERE data->'specifications' ? 'Bagaj Hacmi';
UPDATE cars SET data = _rename_spec_key(data, 'Ağırlık', 'weight') WHERE data->'specifications' ? 'Ağırlık';
UPDATE cars SET data = _rename_spec_key(data, 'Hava Yastığı', 'airbags') WHERE data->'specifications' ? 'Hava Yastığı';
UPDATE cars SET data = _rename_spec_key(data, 'ABS', 'abs') WHERE data->'specifications' ? 'ABS';
UPDATE cars SET data = _rename_spec_key(data, 'ESP', 'esp') WHERE data->'specifications' ? 'ESP';
UPDATE cars SET data = _rename_spec_key(data, 'ISOFIX', 'isofix') WHERE data->'specifications' ? 'ISOFIX';
UPDATE cars SET data = _rename_spec_key(data, 'Acil Fren (AEB)', 'aeb') WHERE data->'specifications' ? 'Acil Fren (AEB)';
UPDATE cars SET data = _rename_spec_key(data, 'Şerit Takip Sistemi', 'laneKeep') WHERE data->'specifications' ? 'Şerit Takip Sistemi';
UPDATE cars SET data = _rename_spec_key(data, 'Kör Nokta Uyarısı', 'blindSpot') WHERE data->'specifications' ? 'Kör Nokta Uyarısı';
UPDATE cars SET data = _rename_spec_key(data, 'Yorgunluk Tespit', 'fatigueDetection') WHERE data->'specifications' ? 'Yorgunluk Tespit';
UPDATE cars SET data = _rename_spec_key(data, 'Nesil', 'generation') WHERE data->'specifications' ? 'Nesil';
UPDATE cars SET data = _rename_spec_key(data, 'Platform', 'platform') WHERE data->'specifications' ? 'Platform';
UPDATE cars SET data = _rename_spec_key(data, 'Üretim Yılları', 'productionYears') WHERE data->'specifications' ? 'Üretim Yılları';
UPDATE cars SET data = _rename_spec_key(data, '0 km Fiyat', 'newPrice') WHERE data->'specifications' ? '0 km Fiyat';
UPDATE cars SET data = _rename_spec_key(data, '2. El Ortalama', 'usedPrice') WHERE data->'specifications' ? '2. El Ortalama';
UPDATE cars SET data = _rename_spec_key(data, 'Fiyat Güncelleme', 'priceDate') WHERE data->'specifications' ? 'Fiyat Güncelleme';

-- Cleanup: drop temporary function
DROP FUNCTION IF EXISTS _rename_spec_key(jsonb, text, text);
