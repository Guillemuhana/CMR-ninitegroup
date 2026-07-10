-- Renombrar vendedor: "Carlos Sotelo" -> "Carlos Andres Sotelo"
-- Correr en el SQL Editor de Supabase (proyecto de produccion).
--
-- Actualiza las 3 tablas que guardan al vendedor por su NOMBRE (texto).
-- Las tablas diario_vendedor, agenda_vendedor y sesiones_vendedor usan
-- vendedor_id (FK a vendedores.id), asi que no hace falta tocarlas.
--
-- El email de acceso NO cambia: el vendedor sigue entrando con el mismo
-- email y contrasena. Solo cambia el nombre visible.

-- (opcional) Control previo: cuantas filas se van a renombrar
-- select 'vendedores' t, count(*) from vendedores where nombre = 'Carlos Sotelo'
-- union all select 'contactos', count(*) from contactos where vendedor = 'Carlos Sotelo'
-- union all select 'pedidos',   count(*) from pedidos   where vendedor = 'Carlos Sotelo';

begin;

update vendedores set nombre   = 'Carlos Andres Sotelo' where nombre   = 'Carlos Sotelo';
update contactos   set vendedor = 'Carlos Andres Sotelo' where vendedor = 'Carlos Sotelo';
update pedidos     set vendedor = 'Carlos Andres Sotelo' where vendedor = 'Carlos Sotelo';

commit;
