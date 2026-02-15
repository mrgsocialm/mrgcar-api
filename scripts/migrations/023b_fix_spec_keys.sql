-- Fix migration v2: explicit jsonb casts for json-type data column

UPDATE cars SET data = (
  jsonb_set(
    data::jsonb, '{specifications}',
    ((data::jsonb->'specifications') - 'Yakıt Tüketimi (Şehir)') || jsonb_build_object('cityFuel', data::jsonb->'specifications'->'Yakıt Tüketimi (Şehir)')
  )
)::json
WHERE data::jsonb->'specifications' ? 'Yakıt Tüketimi (Şehir)'
  AND NOT (data::jsonb->'specifications' ? 'cityFuel');

UPDATE cars SET data = (
  jsonb_set(
    data::jsonb, '{specifications}',
    ((data::jsonb->'specifications') - 'Yakıt Tüketimi (Yol)') || jsonb_build_object('highwayFuel', data::jsonb->'specifications'->'Yakıt Tüketimi (Yol)')
  )
)::json
WHERE data::jsonb->'specifications' ? 'Yakıt Tüketimi (Yol)'
  AND NOT (data::jsonb->'specifications' ? 'highwayFuel');

UPDATE cars SET data = (
  jsonb_set(
    data::jsonb, '{specifications}',
    ((data::jsonb->'specifications') - 'Yakıt Tüketimi (Karma)') || jsonb_build_object('combinedFuel', data::jsonb->'specifications'->'Yakıt Tüketimi (Karma)')
  )
)::json
WHERE data::jsonb->'specifications' ? 'Yakıt Tüketimi (Karma)'
  AND NOT (data::jsonb->'specifications' ? 'combinedFuel');

UPDATE cars SET data = (
  jsonb_set(
    data::jsonb, '{specifications}',
    ((data::jsonb->'specifications') - 'Uzunluk') || jsonb_build_object('length', data::jsonb->'specifications'->'Uzunluk')
  )
)::json
WHERE data::jsonb->'specifications' ? 'Uzunluk'
  AND NOT (data::jsonb->'specifications' ? 'length');

UPDATE cars SET data = (
  jsonb_set(
    data::jsonb, '{specifications}',
    ((data::jsonb->'specifications') - 'Genişlik') || jsonb_build_object('width', data::jsonb->'specifications'->'Genişlik')
  )
)::json
WHERE data::jsonb->'specifications' ? 'Genişlik'
  AND NOT (data::jsonb->'specifications' ? 'width');
