#!/usr/bin/env bash
# =============================================================================
#  TRAZZA — Enlace con Firebase, de cero a desplegado, en un comando (bash)
# -----------------------------------------------------------------------------
#  Es el mismo procedimiento que enlazar.ps1, para macOS, Linux o Git Bash.
#
#    bash herramientas/enlazar.sh --proyecto trazza-misagi --empresa misagi \
#         --razon "MISAGI S.A.C." --ruc 20123456789
#
#  Agrega --existente si el proyecto Firebase ya está creado.
#  Agrega --sin-publicar para configurar sin desplegar todavía.
# =============================================================================
set -uo pipefail

PROYECTO=""; EMPRESA=""; NOMBRE="Trazza"; RAZON=""; RUC=""; REGION="nam5"
APPCHECK=""; EXISTENTE=0; SINPUB=0

while [ $# -gt 0 ]; do
  case "$1" in
    --proyecto)      PROYECTO="$2"; shift 2 ;;
    --empresa)       EMPRESA="$2";  shift 2 ;;
    --nombre)        NOMBRE="$2";   shift 2 ;;
    --razon)         RAZON="$2";    shift 2 ;;
    --ruc)           RUC="$2";      shift 2 ;;
    --region)        REGION="$2";   shift 2 ;;
    --appcheck)      APPCHECK="$2"; shift 2 ;;
    --existente)     EXISTENTE=1;   shift ;;
    --sin-publicar)  SINPUB=1;      shift ;;
    *) echo "Opción desconocida: $1"; exit 1 ;;
  esac
done

titulo() { printf "\n  \033[36m%s\033[0m\n  \033[90m%s\033[0m\n" "$1" "$(printf '%*s' ${#1} '' | tr ' ' '-')"; }
ok()     { printf "  \033[32mOK\033[0m  %s\n" "$1"; }
aviso()  { printf "  \033[33m!\033[0m   %s\n" "$1"; }
morir()  { printf "\n  \033[31mX\033[0m   %s\n\n" "$1"; exit 1; }

[ -n "$PROYECTO" ] || morir "Falta --proyecto <id>"
[ -n "$EMPRESA" ]  || morir "Falta --empresa <id-corto>"
[ -n "$RAZON" ]    || RAZON="$NOMBRE"

cd "$(dirname "$0")/.." || morir "No pude ubicar la raíz del proyecto"
[ -f firebase.json ] || morir "No encuentro firebase.json. Corre esto desde la carpeta trazza."

titulo "1. Herramientas"
command -v node >/dev/null 2>&1 || morir "Node.js no está instalado. Instálalo desde https://nodejs.org (versión LTS)."
ok "Node $(node -v)"
if ! command -v firebase >/dev/null 2>&1; then
  aviso "La CLI de Firebase no está instalada. Instalando…"
  npm install -g firebase-tools || morir "No se pudo instalar firebase-tools"
fi
ok "firebase-tools $(firebase --version)"

titulo "2. Sesión de Google"
firebase login || morir "No se pudo iniciar sesión."
ok "Sesión iniciada"

titulo "3. Proyecto Firebase"
if [ "$EXISTENTE" -eq 1 ]; then
  ok "Usando el proyecto existente $PROYECTO"
else
  if ! firebase projects:create "$PROYECTO" --display-name "$NOMBRE"; then
    aviso "No se pudo crear (lo más común: el id ya está tomado, o llegaste al límite de proyectos gratuitos)."
    aviso "Si el proyecto ya es tuyo, repite agregando --existente"
    morir "Detenido antes de tocar nada."
  fi
  ok "Proyecto creado"
fi
printf '{\n  "projects": {\n    "default": "%s"\n  }\n}\n' "$PROYECTO" > .firebaserc
ok ".firebaserc apunta a $PROYECTO"

titulo "4. Base de datos Firestore"
if firebase firestore:databases:create "(default)" --location "$REGION" --project "$PROYECTO" >/dev/null 2>&1; then
  ok "Firestore creada en $REGION"
else
  aviso "No se pudo crear desde la CLI (suele ser porque ya existe)."
  aviso "Si es la primera vez, ábrela una vez en:"
  aviso "  https://console.firebase.google.com/project/$PROYECTO/firestore  (Modo producción, región $REGION)"
fi

titulo "5. App web y credenciales"
firebase apps:create WEB "$NOMBRE" --project "$PROYECTO" >/dev/null 2>&1 || true
firebase apps:list WEB --project "$PROYECTO" --json > .tmp-apps.json || morir "No pude listar las apps"
APPID="$(node herramientas/leer-appid.js .tmp-apps.json)" || morir "No pude leer el appId (revisa .tmp-apps.json)"
[ -n "$APPID" ] || morir "appId vacío"
ok "App web $APPID"
firebase apps:sdkconfig WEB "$APPID" --project "$PROYECTO" --json > .tmp-sdk.json || morir "No pude leer la configuración del SDK"

titulo "6. Configuración del tenant"
node herramientas/escribir-config.js --sdk .tmp-sdk.json --empresa "$EMPRESA" \
  --nombre "$NOMBRE" --razon "$RAZON" --ruc "$RUC" --appcheck "$APPCHECK" \
  || morir "Falló la escritura de trazza.config.js"
rm -f .tmp-apps.json .tmp-sdk.json

if [ "$SINPUB" -eq 1 ]; then
  titulo "7. Publicación OMITIDA (--sin-publicar)"
else
  titulo "7. Publicación"
  if firebase deploy --only firestore:rules,firestore:indexes,storage,hosting --project "$PROYECTO"; then
    ok "Publicado en https://$PROYECTO.web.app"
  else
    aviso "El deploy falló. Si el error menciona Storage, el bucket aún no existe:"
    aviso "  https://console.firebase.google.com/project/$PROYECTO/storage  → Comenzar, y repite."
  fi
fi

cat <<FIN

  FALTAN TRES CLICS EN LA CONSOLA (no se pueden hacer desde aquí):
    1. Authentication → Sign-in method → activar "Correo/contraseña"
       https://console.firebase.google.com/project/$PROYECTO/authentication/providers
    2. Storage → Comenzar (crea el bucket)
       https://console.firebase.google.com/project/$PROYECTO/storage
    3. App Check → reCAPTCHA v3 → copiar la clave del sitio
       https://console.firebase.google.com/project/$PROYECTO/appcheck

  DESPUÉS, EL PRIMER ADMINISTRADOR:
    Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.
    Guárdala como clave-servicio.json en esta carpeta y corre:

      node herramientas/crear-admin.js --correo tu@correo.com --clave 'UnaClaveLarga' \\
           --nombre 'Mateo Bartra' --empresa $EMPRESA

    Ese archivo NO se sube a ningún lado. Ya está en .gitignore.

FIN
