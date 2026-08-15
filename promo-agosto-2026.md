# Promo agosto 2026 — 2-Stall a $19,500

Textos listos para copiar y pegar en **Promociones**. Una misma campaña usa los
dos: el texto libre va a quien escribió hace menos de 24 h, la plantilla a todo
el resto. Ver `PROMOCIONES.md` para el porqué.

---

## 1) Texto libre — pegar en el campo "Mensaje"

Sin la presentación "This is Nicolás from NINI T-Group": el CRM ya antepone
`*Nicolas · NINIT Group:*` a todo lo que sale por WhatsApp, y si no, el cliente
lee la firma dos veces.

```
Hi, how are you? I'm following up regarding the restroom trailer you previously inquired about. We have updated our August pricing and our 2-Stall model now starts at just $19,500.

This promotional price is available for a limited number of units currently in our inventory, while supplies last. We offer nationwide delivery.

If you're still interested, send me your ZIP code and I'll send the updated specs, photos, and a delivery estimate.
```

> **No uses `{nombre}` en este mensaje.** Muchos contactos entran sin nombre
> cargado y quedaría "Hi , how are you?". Si querés personalizarlo, avisame y
> lo arreglo primero.

---

## 2) Plantilla — crear en Meta Business Manager

**Nombre:** `promo_seguimiento_precio` · **Categoría:** Marketing · **Idioma:** `en_US`

Cuerpo (acá SÍ va la presentación: Meta manda el cuerpo limpio, sin el prefijo
del CRM):

```
Hi, how are you? This is Nicolás from NINI T-Group.

I'm following up regarding the restroom trailer you previously inquired about. We have updated our {{1}} pricing and our {{2}} model now starts at just {{3}}.

This promotional price is available for a limited number of units currently in our inventory, while supplies last. We offer nationwide delivery.

If you're still interested, send me your ZIP code and I'll send the updated specs, photos, and a delivery estimate. Would you like me to update your quote?
```

Está parametrizada a propósito: **cambiar mes, modelo o precio no requiere
volver a pedir aprobación**, solo cambiar los valores en el CRM. Cambiar el
texto sí la requiere.

**Ejemplo de aprobación** (Meta lo pide para revisar): `August`, `2-Stall`, `$19,500`.

---

## 3) Qué cargar en el CRM

| Campo | Valor |
|---|---|
| Nombre de la campaña | `Promo agosto 2026 — 2-Stall $19,500` |
| Mensaje | el bloque 1 de arriba |
| Usar plantilla | ✅ tildado |
| Nombre de la plantilla | `promo_seguimiento_precio` |
| Idioma | `en_US` |
| Variables | `August \| 2-Stall \| $19,500` |
| Canal | Todos |
| Escribieron en | a criterio (empezar por *Últimos 3 meses*) |
| Excluir estados | `perdido`, `cerrado`, y considerar `vendido` |
| Ritmo | Prudente (3 s) la primera vez |

---

## Checklist antes de apretar enviar

- [ ] La plantilla figura **Aprobada** en WhatsApp Manager (si dice "En revisión", los de +24 h van a fallar todos).
- [ ] Mandada la **prueba a tu propio número** y leída como la lee un cliente.
- [ ] Revisado el desglose: cuántos por texto libre, cuántos por plantilla, cuántos quedan afuera.
- [ ] Sabés el **costo**: las plantillas de Marketing se cobran por mensaje entregado.
- [ ] La pestaña se puede quedar abierta el tiempo que estima el panel.

## Después

Los que contesten reabren su ventana de 24 h, así que a partir de ahí se les
responde normal desde el chat. Si alguien pide que no le escriban más, cargalo
en `promos_baja` (SQL en `PROMOCIONES.md`) — esa lista se respeta siempre.
