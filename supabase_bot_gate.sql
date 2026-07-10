-- Gate del bot con auto-pausa cuando el cliente pide un humano.
-- Correr en el SQL Editor de Supabase (proyecto de produccion xeggotxdridyuwvxxfko).
--
-- Reemplaza a get_bot_activo en el workflow n8n "Nini-TGroup-chat":
-- el bot llama a esta funcion en cada mensaje entrante (WhatsApp/Messenger/SMS)
-- pasando el telefono/PSID y el TEXTO del mensaje.
--
--   - Si el texto contiene "human" (human, humano, humana...), pone
--     contactos.bot_activo = false y devuelve {"estado":"pausado"}.
--     -> el bot NO responde ese mensaje y queda pausado para siempre en ese
--        chat, hasta que un humano lo reactive con el boton Bot/"Yo atiendo".
--   - Si no, devuelve el estado actual segun bot_activo (igual que antes).
--
-- SECURITY DEFINER: bypassa RLS (n8n solo tiene la anon key). Fail-open por
-- diseno: si algo falla, el workflow deja pasar y el bot responde igual.

create or replace function public.bot_gate(p_telefono text, p_mensaje text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ¿El cliente pide hablar con un humano?  (case-insensitive, cubre humano/humana)
  if coalesce(p_mensaje, '') ~* 'human' then
    update contactos set bot_activo = false where telefono = p_telefono;
    return json_build_object('estado', 'pausado');
  end if;

  -- Si no lo pide, devolver el estado actual del chat.
  return json_build_object('estado',
    case when coalesce((select bot_activo from contactos where telefono = p_telefono limit 1), true)
         then 'activo' else 'pausado' end);
end;
$$;

grant execute on function public.bot_gate(text, text) to anon, authenticated;
