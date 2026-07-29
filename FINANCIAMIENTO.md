# Financiamiento — Ascentium Capital

Módulo para registrar el financiamiento de cada cliente y difundir el link de la
solicitud. Pedido del CEO del 29-jul-2026.

**Link de la solicitud:**
`https://icalcpayment.com/customericalc/99c2d069-0666-4798-8c3d-8d32787b0d5f`

> El link es **uno solo para todos los clientes**, no uno por cliente. Por eso el
> CRM registra a quién y cuándo se lo mandamos, pero Ascentium no puede avisarnos
> automáticamente quién aplicó: eso lo detecta la IA leyendo el chat.
> Si en algún momento se consiguen links individuales, cambiar `LINK_FIN` en
> `src/lib.js` por uno por cliente mejora muchísimo el seguimiento.

---

## Lo que hace el CRM

### Ficha del cliente → sección "Financiamiento"
Los 9 campos que pidió el CEO: interés (Sí/No), estado, link enviado + fecha,
monto estimado, modelo, socio, fecha de seguimiento y notas. Guarda solo.

### Los 10 estados
Se guardan en inglés (vocabulario del CEO y de Ascentium) y se muestran en
español. Definidos en `ESTADOS_FIN` (`src/lib.js`):

| Guardado | Se ve en la app |
|---|---|
| `financing_offered` | Financiamiento ofrecido |
| `link_sent` | Link enviado |
| `customer_reviewing` | Cliente evaluando |
| `application_started` | Solicitud iniciada |
| `application_submitted` | Solicitud presentada |
| `approved` | Aprobado |
| `info_required` | Falta información |
| `declined` | Rechazado |
| `funded` | Desembolsado ✓ |
| `closed_not_interested` | Cerrado / ya no interesa |

### Recordatorios automáticos
Al marcar el link como enviado (o al mandarlo con el botón del chat) se crean
dos eventos en la Agenda del vendedor, a las 10 de la mañana:

- **24 h después** — "preguntar si pudo abrirlo y si tiene dudas"
- **3 días después** — "consultar si avanzó con la solicitud"

### Aviso automático de "ya presenté la solicitud"
`api/_fin/detectar.js`, colgado de `api/push-send.js`. Corre en el servidor con
cada mensaje entrante, así que funciona con la app cerrada. Solo mira clientes
con el link enviado y el trámite abierto. Cuando la IA detecta que el cliente
avisó que aplicó: pasa el estado a **Solicitud presentada** y manda un push al
CEO y al vendedor.

El umbral de confianza es alto (70) a propósito: un aviso de más al CEO molesta
más que uno de menos. Para probar el clasificador sin tocar nada:

```
$env:GROQ_API_KEY = "gsk_..."
node scripts/probar-deteccion-fin.mjs
```

### Dónde ya viaja el link
- Botón **Financiamiento** en el menú ＋ del chat (manda el mensaje, marca la
  ficha y agenda los seguimientos, todo de un toque)
- Al final del texto de la **cotización** que ya se enviaba

---

## Textos para pegar fuera del CRM

Estos no los puede mandar la app: son plataformas externas donde hay que
pegarlos a mano una sola vez.

### Firma de email (Gmail → Configuración → Firma)

```html
<p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#444;">
  💳 <strong>Financing available</strong> — get your restroom trailer now and pay over time.
  <a href="https://icalcpayment.com/customericalc/99c2d069-0666-4798-8c3d-8d32787b0d5f"
     style="color:#15803D;font-weight:bold;text-decoration:none;">Check your options →</a>
</p>
```

### Facebook Marketplace (al final de la descripción)

```
💳 FINANCING AVAILABLE
Don't pay it all upfront. We partner with Ascentium Capital so you can finance
your restroom trailer with a quick online application and flexible terms.

Apply here: https://icalcpayment.com/customericalc/99c2d069-0666-4798-8c3d-8d32787b0d5f
```

### Email de seguimiento (a las 24 h de mandar el link)

```
Subject: Quick question about your financing application

Hi [NAME],

I wanted to check in — were you able to open the financing application I sent
yesterday? It only takes a few minutes and there's no obligation to see what
terms you qualify for.

Apply here: https://icalcpayment.com/customericalc/99c2d069-0666-4798-8c3d-8d32787b0d5f

If anything came up or you'd rather walk through it together, just reply and
I'll help you out.

Best,
[SELLER]
NINIT Group
```

### Purchase Agreements y catálogos digitales

⚠️ **Pendiente.** No sabemos con qué se generan hoy (¿Word, Canva, PDF a mano?).
Cuando se sepa, sumar el bloque de "Facebook Marketplace" de arriba o el de la
firma, según el formato.

---

## Puesta en marcha

1. Correr `supabase_financiamiento.sql` en el SQL Editor de producción — **hecho
   el 29-jul-2026**.
2. `GROQ_API_KEY` tiene que estar en Vercel (ya estaba: la usa el resto del CRM).
3. Pegar los textos de arriba en Gmail y Facebook Marketplace — **pendiente, es
   manual**. (eBay quedó fuera: NINIT ya no publica ahí.)
