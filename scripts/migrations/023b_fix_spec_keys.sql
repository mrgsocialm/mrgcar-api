-- Fix migration: Handle remaining Turkish keys that failed due to non-JSONB data
-- Uses inline SQL with jsonb_typeof guard to avoid parse errors

UPDATE cars SET data = jsonb_set(
  data, '{specifications}',
  (data->'specifications' - 'Yakıt Tüketimi (Şehir)') || jsonb_build_object('cityFuel', data->'specifications'->'Yakıt Tüketimi (Şehir)')
) WHERE data->'specifications' ? 'Yakıt Tüketimi (Şehir)'
  AND NOT (data->'specifications' ? 'cityFuel')
  AND jsonb_typeof(data->'specifications') = 'object';

UPDATE cars SET data = jsonb_set(
  data, '{specifications}',
  (data->'specifications' - 'Yakıt Tüketimi (Yol)') || jsonb_build_object('highwayFuel', data->'specifications'->'Yakıt Tüketimi (Yol)')
) WHERE data->'specifications' ? 'Yakıt Tüketimi (Yol)'
  AND NOT (data->'specifications' ? 'highwayFuel')
  AND jsonb_typeof(data->'specifications') = 'object';

UPDATE cars SET data = jsonb_set(
  data, '{specifications}',
  (data->'specifications' - 'Yakıt Tüketimi (Karma)') || jsonb_build_object('combinedFuel', data->'specifications'->'Yakıt Tüketimi (Karma)')
) WHERE data->'specifications' ? 'Yakıt Tüketimi (Karma)'
  AND NOT (data->'specifications' ? 'combinedFuel')
  AND jsonb_typeof(data->'specifications') = 'object';

UPDATE cars SET data = jsonb_set(
  data, '{specifications}',
  (data->'specifications' - 'Uzunluk') || jsonb_build_object('length', data->'specifications'->'Uzunluk')
) WHERE data->'specifications' ? 'Uzunluk'
  AND NOT (data->'specifications' ? 'length')
  AND jsonb_typeof(data->'specifications') = 'object';

UPDATE cars SET data = jsonb_set(
  data, '{specifications}',
  (data->'specifications' - 'Genişlik') || jsonb_build_object('width', data->'specifications'->'Genişlik')
) WHERE data->'specifications' ? 'Genişlik'
  AND NOT (data->'specifications' ? 'width')
  AND jsonb_typeof(data->'specifications') = 'object';
