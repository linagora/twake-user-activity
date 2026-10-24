#!/usr/bin/env bash
# Installs the Matomo of `docker compose --profile matomo up`, gives each app a
# site with tenant and platform dimensions, and prints the bridge settings for .env.
# Safe to run again: it only creates what is missing.
#
#   scripts/matomo-setup.sh >> .env
set -euo pipefail

MATOMO="${MATOMO_URL:-http://127.0.0.1:8081}"
LOGIN="${MATOMO_ADMIN:-admin}"
PASSWORD="${MATOMO_ADMIN_PASSWORD:-admin-local-only-1}"
APPS="${MATOMO_APPS:-mail chat drive calendar}"

jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT
installer() {
  curl -sf -o /dev/null -c "$jar" -b "$jar" -X POST \
    "$MATOMO/index.php?action=$1" "${@:2}" --data-urlencode submit=Next
}

for _ in $(seq 1 60); do
  curl -sf -o /dev/null "$MATOMO/" && break
  sleep 2
done
curl -sf -o /dev/null "$MATOMO/" || { echo "no Matomo at $MATOMO" >&2; exit 1; }

# This call authenticates with the password itself, so it needs no session,
# and it fails until Matomo is installed.
create_token() {
  curl -s -X POST "$MATOMO/index.php" -d module=API -d format=json \
    -d method=UsersManager.createAppSpecificTokenAuth \
    --data-urlencode userLogin="$LOGIN" \
    --data-urlencode passwordConfirmation="$PASSWORD" \
    -d description=twake-user-activity | sed -nE 's/.*"value":"([0-9a-f]{32})".*/\1/p'
}

token="$(create_token)"
if [[ -z "$token" ]]; then
  echo "installing Matomo at $MATOMO" >&2
  curl -sf -o /dev/null -c "$jar" -b "$jar" "$MATOMO/index.php"
  installer databaseSetup --data-urlencode host=mariadb \
    --data-urlencode username=matomo --data-urlencode password=matomo \
    --data-urlencode dbname=matomo --data-urlencode tables_prefix=matomo_ \
    --data-urlencode 'adapter=PDO\MYSQL' --data-urlencode schema=Mariadb
  curl -sf -o /dev/null -c "$jar" -b "$jar" "$MATOMO/index.php?action=tablesCreation"
  installer setupSuperUser --data-urlencode login="$LOGIN" \
    --data-urlencode password="$PASSWORD" --data-urlencode password_bis="$PASSWORD" \
    --data-urlencode email=admin@example.com
  # The installer insists on a first site; it becomes the first app's.
  first="${APPS%% *}"
  installer firstWebsiteSetup --data-urlencode siteName="$first" \
    --data-urlencode url="https://$first.example.com" \
    --data-urlencode timezone=UTC --data-urlencode ecommerce=0
  installer finished --data-urlencode do_not_track=1 --data-urlencode anonymise_ip=1
  token="$(create_token)"
fi
[[ -n "$token" ]] || { echo "could not create a token" >&2; exit 1; }

api() {
  curl -sf -X POST "$MATOMO/index.php" -d module=API -d format=json \
    --data-urlencode token_auth="$token" "$@"
}
site_id() {
  api -d method=SitesManager.getAllSites |
    node -e 'const sites = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const site = sites.find(s => s.name === process.argv[1]);
      if (site) console.log(site.idsite)' "$1"
}
dimension_id() {
  api -d method=CustomDimensions.getConfiguredCustomDimensions -d idSite="$1" |
    node -e 'const dims = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const dim = dims.find(d => d.name === process.argv[1]);
      if (dim) console.log(dim.idcustomdimension)' "$2"
}

sites=()
declare -A dimensions=()
for app in $APPS; do
  id="$(site_id "$app")"
  if [[ -z "$id" ]]; then
    api -d method=SitesManager.addSite --data-urlencode siteName="$app" \
      --data-urlencode "urls[0]=https://$app.example.com" >/dev/null
    id="$(site_id "$app")"
  fi
  for name in tenant platform; do
    dim="$(dimension_id "$id" "$name")"
    if [[ -z "$dim" ]]; then
      api -d method=CustomDimensions.configureNewCustomDimension -d idSite="$id" \
        -d name="$name" -d scope=visit -d active=1 >/dev/null
      dim="$(dimension_id "$id" "$name")"
    fi
    [[ -n "$dim" ]] || { echo "could not create dimension $name on site $app" >&2; exit 1; }
    # The bridge takes one dimension number for every site, and Matomo numbers
    # dimensions per site, so a site with other dimensions can disagree.
    if [[ -n "${dimensions[$name]:-}" && "$dim" != "${dimensions[$name]}" ]]; then
      echo "site $app has $name as dimension $dim, other sites as ${dimensions[$name]}" >&2
      exit 1
    fi
    dimensions[$name]="$dim"
  done
  sites+=("\"$app\":$id")
  echo "site $id: $app" >&2
done

echo "ANALYTICS_BACKEND=matomo"
echo "MATOMO_URL=$MATOMO"
echo "MATOMO_TOKEN=$token"
echo "MATOMO_SITES={$(IFS=,; echo "${sites[*]}")}"
echo "MATOMO_DIMENSIONS={\"tenant\":${dimensions[tenant]},\"platform\":${dimensions[platform]}}"
echo "matomo is ready at $MATOMO, login $LOGIN / $PASSWORD" >&2
