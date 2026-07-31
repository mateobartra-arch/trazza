<#
==============================================================================
 TRAZZA — Enlace con Firebase, de cero a desplegado, en un comando (Windows)
------------------------------------------------------------------------------
 QUÉ HACE, EN ORDEN

   1. Comprueba que existan Node y la CLI de Firebase (la instala si falta).
   2. Abre el navegador para iniciar sesión con tu cuenta de Google.
   3. Crea el proyecto Firebase (o usa el que le indiques).
   4. Crea la base Firestore.
   5. Registra la app web y LEE sus credenciales de la propia CLI.
   6. Escribe public/core/trazza.config.js con esas credenciales.
   7. Publica reglas de Firestore, índices, reglas de Storage y el sitio.

 QUÉ NO HACE, PORQUE NO SE PUEDE DESDE LA LÍNEA DE COMANDOS

   • Activar el proveedor "Correo y contraseña" en Authentication.
   • Activar App Check y sacar la clave de reCAPTCHA v3.
   • Activar Cloud Storage la primera vez.
   Esos tres pasos son tres clics en la consola web y están en
   ENLAZAR-FIREBASE.md con la URL exacta. El script te los recuerda al final.

 CÓMO SE USA (PowerShell, dentro de la carpeta trazza)

   .\herramientas\enlazar.ps1 -Proyecto trazza-misagi -Empresa acme -Razon "ACME TRANSPORTES S.A.C." -Ruc 20123456789

 Si el proyecto ya existe, agrega  -Existente  y no intentará crearlo.
==============================================================================
#>
param(
  [Parameter(Mandatory = $true)][string]$Proyecto,
  [Parameter(Mandatory = $true)][string]$Empresa,
  [string]$Nombre  = "Trazza",
  [string]$Razon   = "",
  [string]$Ruc     = "",
  [string]$Region  = "nam5",
  [string]$AppCheck = "",
  [switch]$Existente,
  [switch]$SinPublicar
)

$ErrorActionPreference = "Stop"
if (-not $Razon) { $Razon = $Nombre }

function Titulo($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor Cyan; Write-Host ("  " + ("-" * $t.Length)) -ForegroundColor DarkGray }
function Ok($t)     { Write-Host "  OK  $t" -ForegroundColor Green }
function Aviso($t)  { Write-Host "  !   $t" -ForegroundColor Yellow }
function Morir($t)  { Write-Host ""; Write-Host "  X   $t" -ForegroundColor Red; Write-Host ""; exit 1 }

# La raíz del proyecto es la carpeta que contiene a herramientas\.
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz
if (-not (Test-Path "firebase.json")) { Morir "No encuentro firebase.json. Ejecuta el script desde la carpeta trazza." }

Titulo "1. Herramientas"
try { $nodeV = (node -v) } catch { Morir "Node.js no esta instalado. Descargalo de https://nodejs.org (version LTS) y vuelve a correr esto." }
Ok "Node $nodeV"
$tieneCli = $true
try { $fbV = (firebase --version) } catch { $tieneCli = $false }
if (-not $tieneCli) {
  Aviso "La CLI de Firebase no esta instalada. Instalando (esto tarda un par de minutos)..."
  npm install -g firebase-tools
  $fbV = (firebase --version)
}
Ok "firebase-tools $fbV"

Titulo "2. Sesion de Google"
# Si ya hay sesion, esto no vuelve a abrir el navegador.
firebase login
if ($LASTEXITCODE -ne 0) { Morir "No se pudo iniciar sesion." }
Ok "Sesion iniciada"

Titulo "3. Proyecto Firebase"
if ($Existente) {
  Ok "Usando el proyecto existente $Proyecto"
} else {
  Write-Host "  Creando $Proyecto ..."
  firebase projects:create $Proyecto --display-name "$Nombre"
  if ($LASTEXITCODE -ne 0) {
    Aviso "No se pudo crear (lo mas comun: el id ya esta tomado por otra cuenta, o llegaste al limite de proyectos gratuitos)."
    Aviso "Si el proyecto ya es tuyo, vuelve a correr esto agregando  -Existente"
    Morir "Detenido antes de tocar nada."
  }
  Ok "Proyecto creado"
}
# .firebaserc: fija el proyecto por defecto para no tener que pasar --project nunca mas.
'{
  "projects": {
    "default": "' + $Proyecto + '"
  }
}' | Set-Content -Encoding UTF8 ".firebaserc"
Ok ".firebaserc apunta a $Proyecto"

Titulo "4. Base de datos Firestore"
firebase firestore:databases:create "(default)" --location $Region --project $Proyecto 2>$null
if ($LASTEXITCODE -ne 0) {
  Aviso "No se pudo crear la base desde la CLI (suele pasar si ya existe, o si la version de la CLI no trae el comando)."
  Aviso "Si es la primera vez, abrela una vez desde: https://console.firebase.google.com/project/$Proyecto/firestore"
  Aviso "Elige 'Modo produccion' y la region $Region. Luego vuelve a correr este script con -Existente."
} else {
  Ok "Firestore creada en $Region"
}

Titulo "5. App web y credenciales"
firebase apps:create WEB "$Nombre" --project $Proyecto 2>$null | Out-Null
firebase apps:list WEB --project $Proyecto --json | Set-Content -Encoding UTF8 ".tmp-apps.json"
$AppId = node herramientas/leer-appid.js ".tmp-apps.json"
if (-not $AppId) { Morir "No pude obtener el appId. Revisa .tmp-apps.json" }
Ok "App web $AppId"
firebase apps:sdkconfig WEB $AppId --project $Proyecto --json | Set-Content -Encoding UTF8 ".tmp-sdk.json"

Titulo "6. Configuracion del tenant"
node herramientas/escribir-config.js --sdk ".tmp-sdk.json" --empresa $Empresa --nombre "$Nombre" --razon "$Razon" --ruc "$Ruc" --appcheck "$AppCheck"
if ($LASTEXITCODE -ne 0) { Morir "Fallo la escritura de trazza.config.js" }
Remove-Item ".tmp-apps.json", ".tmp-sdk.json" -ErrorAction SilentlyContinue

if ($SinPublicar) {
  Titulo "7. Publicacion OMITIDA (-SinPublicar)"
} else {
  Titulo "7. Publicacion"
  firebase deploy --only firestore:rules,firestore:indexes,storage,hosting --project $Proyecto
  if ($LASTEXITCODE -ne 0) {
    Aviso "El deploy fallo. Si el error menciona Storage, es porque el bucket todavia no existe:"
    Aviso "abre https://console.firebase.google.com/project/$Proyecto/storage una vez y repite."
  } else {
    Ok "Publicado en https://$Proyecto.web.app"
  }
}

Write-Host ""
Write-Host "  FALTAN TRES CLICS EN LA CONSOLA (no se pueden hacer desde aqui):" -ForegroundColor Cyan
Write-Host "    1. Authentication -> Sign-in method -> activar 'Correo/contrasena'"
Write-Host "       https://console.firebase.google.com/project/$Proyecto/authentication/providers"
Write-Host "    2. Storage -> Comenzar (crea el bucket)"
Write-Host "       https://console.firebase.google.com/project/$Proyecto/storage"
Write-Host "    3. App Check -> reCAPTCHA v3 -> copiar la clave del sitio"
Write-Host "       https://console.firebase.google.com/project/$Proyecto/appcheck"
Write-Host ""
Write-Host "  DESPUES, EL PRIMER ADMINISTRADOR:" -ForegroundColor Cyan
Write-Host "    Descarga la clave de servicio (Configuracion del proyecto -> Cuentas de servicio"
Write-Host "    -> Generar nueva clave privada), guardala como clave-servicio.json en esta carpeta y corre:"
Write-Host "      node herramientas/crear-admin.js --clave 'UnaClaveLarga' --nombre 'Mateo Bartra'"
Write-Host "    El correo y la empresa salen de public/core/trazza.config.js (correoAdmin, empresaId)." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Ese archivo NO se sube a ningun lado. Ya esta en .gitignore." -ForegroundColor DarkGray
Write-Host ""
