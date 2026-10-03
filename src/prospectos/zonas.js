// Zonas sugeridas en el buscador de clientes potenciales.
//
// Miami va primero: es la base de NTG y donde se puede visitar. Después el
// resto del sur de Florida, los otros dos puntos logísticos de la ficha
// (Houston TX y Long Beach CA, ver api/_ntg.js) y las áreas grandes de USA
// con mercado de eventos y bodas. Es sólo una ayuda: el campo acepta
// cualquier ciudad, condado, estado o ZIP.

export const ZONA_INICIAL = "Miami, FL";

export const ZONAS = [
  { grupo: "Miami y sur de Florida", lista: [
    "Miami, FL", "Miami Beach, FL", "Doral, FL", "Hialeah, FL", "Coral Gables, FL", "Kendall, FL",
    "Homestead, FL", "Florida Keys, FL", "Fort Lauderdale, FL", "Hollywood, FL", "Pompano Beach, FL",
    "Boca Raton, FL", "Delray Beach, FL", "West Palm Beach, FL", "Jupiter, FL", "Miami-Dade County, FL",
    "Broward County, FL", "Palm Beach County, FL",
  ] },
  { grupo: "Resto de Florida", lista: [
    "Naples, FL", "Fort Myers, FL", "Sarasota, FL", "Tampa, FL", "St. Petersburg, FL", "Orlando, FL",
    "Kissimmee, FL", "Daytona Beach, FL", "Jacksonville, FL", "St. Augustine, FL", "Gainesville, FL",
    "Tallahassee, FL", "Pensacola, FL", "Destin, FL", "Ocala, FL",
  ] },
  { grupo: "Texas (punto logístico Houston)", lista: [
    "Houston, TX", "Katy, TX", "The Woodlands, TX", "Galveston, TX", "Austin, TX", "San Antonio, TX",
    "Dallas, TX", "Fort Worth, TX", "El Paso, TX", "Corpus Christi, TX",
  ] },
  { grupo: "California (punto logístico Long Beach)", lista: [
    "Long Beach, CA", "Los Angeles, CA", "Orange County, CA", "San Diego, CA", "Riverside, CA",
    "Palm Springs, CA", "Santa Barbara, CA", "San Francisco, CA", "San Jose, CA", "Sacramento, CA", "Napa, CA",
  ] },
  { grupo: "Sureste", lista: [
    "Atlanta, GA", "Savannah, GA", "Charleston, SC", "Myrtle Beach, SC", "Charlotte, NC", "Raleigh, NC",
    "Asheville, NC", "Nashville, TN", "Memphis, TN", "Birmingham, AL", "Gulf Shores, AL", "New Orleans, LA",
  ] },
  { grupo: "Oeste y montaña", lista: [
    "Phoenix, AZ", "Scottsdale, AZ", "Tucson, AZ", "Las Vegas, NV", "Denver, CO", "Salt Lake City, UT",
    "Albuquerque, NM", "Boise, ID", "Seattle, WA", "Portland, OR",
  ] },
  { grupo: "Noreste y medio oeste", lista: [
    "New York, NY", "Long Island, NY", "New Jersey", "Philadelphia, PA", "Boston, MA", "Washington, DC",
    "Baltimore, MD", "Virginia Beach, VA", "Chicago, IL", "Detroit, MI", "Columbus, OH", "Indianapolis, IN",
    "Minneapolis, MN", "Kansas City, MO", "St. Louis, MO", "Oklahoma City, OK",
  ] },
  { grupo: "Argentina", lista: [
    "Córdoba, Argentina",
    "Centro, Córdoba, Argentina", "Nueva Córdoba, Córdoba, Argentina", "Güemes, Córdoba, Argentina",
    "Alberdi, Córdoba, Argentina", "Alto Alberdi, Córdoba, Argentina", "Villa Páez, Córdoba, Argentina",
    "Cofico, Córdoba, Argentina", "Alta Córdoba, Córdoba, Argentina", "General Bustos, Córdoba, Argentina",
    "General Paz, Córdoba, Argentina", "Juniors, Córdoba, Argentina", "Pueyrredón, Córdoba, Argentina",
    "San Vicente, Córdoba, Argentina", "Barrio Maipú, Córdoba, Argentina", "Empalme, Córdoba, Argentina",
    "Yofre, Córdoba, Argentina", "Cerro de las Rosas, Córdoba, Argentina", "Urca, Córdoba, Argentina",
    "Villa Belgrano, Córdoba, Argentina", "Argüello, Córdoba, Argentina", "Villa Allende, Córdoba, Argentina",
    "Poeta Lugones, Córdoba, Argentina", "Marqués de Sobremonte, Córdoba, Argentina",
    "Los Boulevares, Córdoba, Argentina", "Villa El Libertador, Córdoba, Argentina",
    "Jardín, Córdoba, Argentina", "Parque Vélez Sarsfield, Córdoba, Argentina",
    "Observatorio, Córdoba, Argentina", "Bella Vista, Córdoba, Argentina",
    "San Martín, Córdoba, Argentina", "Providencia, Córdoba, Argentina",
    "Quebrada de las Rosas, Córdoba, Argentina", "Villa Warcalde, Córdoba, Argentina",
  ] },
];

/** Todas las zonas en orden, sin repetir, para el desplegable. */
export const TODAS_LAS_ZONAS = [...new Set(ZONAS.flatMap((z) => z.lista))];
