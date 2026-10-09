CREATE TABLE public.deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente text NOT NULL, telefone text NOT NULL DEFAULT '', cep text NOT NULL DEFAULT '', endereco text NOT NULL, numero text NOT NULL DEFAULT '', bairro text NOT NULL DEFAULT '', cidade text NOT NULL DEFAULT 'Umuarama', complemento text NOT NULL DEFAULT '', observacoes text NOT NULL DEFAULT '', valor numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0), data_hora timestamptz NOT NULL DEFAULT now(), agendado_para timestamptz, lat double precision CHECK (lat BETWEEN -90 AND 90), lng double precision CHECK (lng BETWEEN -180 AND 180), status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_rota','entregue','cancelada')), pago boolean NOT NULL DEFAULT false, criado_em timestamptz NOT NULL DEFAULT now(), track_code text UNIQUE DEFAULT encode(gen_random_bytes(12),'hex'), CHECK (cep = '' OR (cep ~ '^[0-9]{5}-[0-9]{3}$' AND replace(cep,'-','') !~ '^([0-9])\1{7}$'))
);
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX deliveries_created_idx ON public.deliveries(criado_em DESC);
CREATE INDEX deliveries_status_idx ON public.deliveries(status);
CREATE TABLE public.clientes (
 key text PRIMARY KEY, cliente text NOT NULL, telefone text DEFAULT '', cep text DEFAULT '', endereco text DEFAULT '', numero text DEFAULT '', bairro text DEFAULT '', cidade text DEFAULT '', complemento text DEFAULT '', lat double precision, lng double precision
);
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.produtos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, descricao text DEFAULT '', categoria text DEFAULT 'Geral', preco numeric(12,2) NOT NULL DEFAULT 0 CHECK (preco >= 0), imagem_url text, ativo boolean NOT NULL DEFAULT true, ordem integer NOT NULL DEFAULT 0, criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.produtos TO anon, authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY produtos_publicos ON public.produtos FOR SELECT TO anon, authenticated USING (ativo = true);
CREATE INDEX produtos_order_idx ON public.produtos(ordem,nome);
CREATE TABLE public.company_settings (
 id text PRIMARY KEY DEFAULT 'default', nome text NOT NULL DEFAULT 'O Casarão', saudacao text NOT NULL DEFAULT 'Obrigado pela preferência!', whatsapp_template text NOT NULL DEFAULT '', endereco_origem text, lat_origem double precision, lng_origem double precision, atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_settings TO anon, authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY empresa_publica ON public.company_settings FOR SELECT TO anon, authenticated USING (id = 'default');
CREATE TABLE public.driver_locations (
 id text PRIMARY KEY DEFAULT 'default', lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90), lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180), accuracy double precision, heading double precision, speed double precision, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.driver_locations TO service_role;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.get_track(_code text)
RETURNS TABLE(cliente text, endereco text, numero text, bairro text, cidade text, lat double precision, lng double precision, status text, empresa text, origem_lat double precision, origem_lng double precision, origem_endereco text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT split_part(d.cliente,' ',1), d.endereco,d.numero,d.bairro,d.cidade,d.lat,d.lng,d.status,c.nome,c.lat_origem,c.lng_origem,c.endereco_origem
 FROM public.deliveries d LEFT JOIN public.company_settings c ON c.id='default'
 WHERE d.track_code=_code AND char_length(_code)>=6 LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_track(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_track(text) TO anon, authenticated, service_role;
CREATE FUNCTION public.get_track_driver(_code text)
RETURNS TABLE(lat double precision, lng double precision, accuracy double precision, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT l.lat,l.lng,l.accuracy,l.updated_at FROM public.driver_locations l
 WHERE l.id='default' AND l.updated_at > now()-interval '10 minutes'
 AND EXISTS (SELECT 1 FROM public.deliveries d WHERE d.track_code=_code AND char_length(_code)>=6 AND d.status='em_rota') LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_track_driver(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_track_driver(text) TO anon, authenticated, service_role;
CREATE FUNCTION public.save_online_order(_delivery jsonb, _customer jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.deliveries SELECT * FROM jsonb_populate_record(NULL::public.deliveries,_delivery);
 INSERT INTO public.clientes SELECT * FROM jsonb_populate_record(NULL::public.clientes,_customer)
 ON CONFLICT (key) DO UPDATE SET cliente=excluded.cliente, telefone=excluded.telefone,
 cep=CASE WHEN excluded.cep<>'' THEN excluded.cep ELSE clientes.cep END,
 endereco=CASE WHEN excluded.endereco<>'' THEN excluded.endereco ELSE clientes.endereco END,
 numero=CASE WHEN excluded.endereco<>'' THEN excluded.numero ELSE clientes.numero END,
 bairro=CASE WHEN excluded.endereco<>'' THEN excluded.bairro ELSE clientes.bairro END,
 cidade=CASE WHEN excluded.endereco<>'' THEN excluded.cidade ELSE clientes.cidade END,
 complemento=CASE WHEN excluded.endereco<>'' THEN excluded.complemento ELSE clientes.complemento END;
END;
$$;
REVOKE ALL ON FUNCTION public.save_online_order(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_online_order(jsonb,jsonb) TO service_role;