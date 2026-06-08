-- ============================================================
-- NINIT CRM — Setup CEO para Nicolás
-- Correr en: Supabase proyecto xeggotxdridyuwvxxfko
-- URL: https://supabase.com/dashboard/project/xeggotxdridyuwvxxfko
-- ============================================================

-- 1. Agregar columna role a vendedores (si no existe)
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'vendedor'
  CHECK (role IN ('ceo', 'vendedor'));

-- 2. Agregar columna email (si no existe)
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 3. Upsert de Nicolas como CEO
INSERT INTO public.vendedores (nombre, email, role)
VALUES ('Nicolas', 'ninitgroup@gmail.com', 'ceo')
ON CONFLICT (email) DO UPDATE
  SET role = 'ceo', nombre = 'Nicolas'
WHERE public.vendedores.email = 'ninitgroup@gmail.com';

-- Si la tabla no tiene UNIQUE en email, usar esto en su lugar:
-- UPDATE public.vendedores SET role = 'ceo' WHERE email = 'ninitgroup@gmail.com';
-- Si no hay ningún registro de Nicolas:
-- INSERT INTO public.vendedores (nombre, email, role) VALUES ('Nicolas', 'ninitgroup@gmail.com', 'ceo');

-- 4. Tabla de sesiones de vendedor (tracking tiempo en app)
CREATE TABLE IF NOT EXISTS public.sesiones_vendedor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id     UUID REFERENCES public.vendedores(id) ON DELETE CASCADE,
  inicio_sesion   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin_sesion      TIMESTAMPTZ,
  duracion_seg    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabla diario del vendedor
CREATE TABLE IF NOT EXISTS public.diario_vendedor (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE CASCADE,
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  contenido   TEXT,
  estado_animo TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (vendedor_id, fecha)
);

-- 6. RLS para sesiones
ALTER TABLE public.sesiones_vendedor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendedor_propio_sesion" ON public.sesiones_vendedor;
CREATE POLICY "vendedor_propio_sesion" ON public.sesiones_vendedor
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.diario_vendedor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendedor_propio_diario" ON public.diario_vendedor;
CREATE POLICY "vendedor_propio_diario" ON public.diario_vendedor
  FOR ALL USING (true) WITH CHECK (true);

-- Verificación
SELECT nombre, email, role FROM public.vendedores ORDER BY role;
