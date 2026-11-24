# SmCity — spécification des ressources graphiques

Ce document fixe les noms et emplacements à utiliser pour les nouveaux visuels. Les fichiers listés sont à produire ; ils ne sont pas encore présents dans le dépôt.

## Dossiers

- Sources dessinées : `content/micropolis/images/smcity/source/`
- Tuiles unitaires : `content/micropolis/images/smcity/tiles/`
- Planches / atlases : `content/micropolis/images/smcity/atlases/`
- Icônes d'interface : `content/micropolis/images/smcity/icons/`
- Aperçus : `content/micropolis/images/smcity/previews/`

## Formats et dimensions

- Pixel art PNG RGBA, transparence conservée, sans anticrénelage.
- Une tuile du moteur : 16 × 16 px.
- Un objet 3 × 3 : source de 48 × 48 px, découpable en neuf tuiles de 16 × 16.
- Un objet 4 × 4 : source de 64 × 64 px.
- Un objet 6 × 6 : source de 96 × 96 px.
- Icônes d'interface : SVG 24 × 24 px ; fournir également un PNG 64 × 64 px si une prévisualisation raster est nécessaire.
- Les planches doivent documenter leur grille, l'ordre de lecture et les identifiants de tuiles. Ne pas présumer que le renderer actuel accepte directement un atlas SmCity distinct : l'intégration au tileset existant sera vérifiée avant branchement.

## Nommage des sources

### Agriculture

Créer une source par combinaison spécialisation / échelle / mode, soit 70 sources :

`smcity_a_{specialisation}_d{echelle}_{mode}.png`

Exemples :
- `smcity_a_mar_d1_bio.png`
- `smcity_a_mar_d5_conv.png`
- `smcity_a_cer_d3_bio.png`
- `smcity_a_ele_d4_conv.png`
- `smcity_a_vit_d2_bio.png`
- `smcity_a_arb_d2_bio.png`
- `smcity_a_pol_d3_conv.png`
- `smcity_a_hor_d1_bio.png`

Valeurs autorisées : spécialisation `mar`, `cer`, `ele`, `vit`, `arb`, `pol`, `hor` ; échelle `d1` à `d5` ; mode `bio` ou `conv`.

### Résidentiel, commerce et industrie

- `smcity_r_d1.png`, `smcity_r_d2.png`, `smcity_r_d3.png`
- `smcity_c_prox.png`, `smcity_c_retail.png`, `smcity_c_service.png`, `smcity_c_log.png`
- `smcity_i_light.png`, `smcity_i_heavy.png`, `smcity_i_tech.png`, `smcity_i_data.png`

### Équipements civiques

Préfixe `smcity_civ_` et suffixes :
`admin`, `police`, `fire`, `clinic`, `hospital`, `school`, `lycee`, `university`, `library`, `museum`, `theatre`, `gym`, `pool`, `stadium`, `waste_drop`, `reuse`, `sorting`, `incinerator`, `landfill`.

Exemples : `smcity_civ_hospital.png`, `smcity_civ_incinerator.png`.

### Énergie et infrastructures

- `smcity_inf_power_coal.png`
- `smcity_inf_power_oil.png`
- `smcity_inf_power_gas.png`
- `smcity_inf_power_nuclear.png`
- `smcity_inf_power_wind.png`
- `smcity_inf_power_solar.png`
- `smcity_inf_power_hydro.png`
- `smcity_inf_grid_electric.png`
- `smcity_inf_grid_water.png`
- `smcity_inf_transport_road.png`
- `smcity_inf_transport_rail.png`

### Milieux naturels et espaces paysagers

- `smcity_land_sea.png`, `smcity_land_river.png`, `smcity_land_fleuve.png`, `smcity_land_canal.png`
- `smcity_land_tree.png`, `smcity_land_grove.png`, `smcity_land_forest.png`
- `smcity_land_heath.png`, `smcity_land_meadow.png`, `smcity_land_vegetated_waste.png`
- `smcity_land_park.png`, `smcity_land_square.png`, `smcity_land_bare.png`

## Fichiers d'interface

Créer les pictogrammes SVG suivants dans `icons/` :
- `climate-index.svg`
- `temperature-local.svg`
- `temperature-city.svg`
- `agriculture-bio.svg`
- `agriculture-conventional.svg`
- `food-stock.svg`
- `food-import.svg`
- `food-export.svg`
- `waste-treatment.svg`
- `energy-production.svg`

Les pictogrammes doivent rester lisibles à 24 × 24 px, en monochrome, sans texte incorporé.

## Règle d'intégration

Les sources graphiques ne constituent pas encore les tuiles finales du jeu. Chaque source doit être découpée, indexée dans un atlas et déclarée dans le futur manifeste de tuiles. Le manifeste devra faire le lien entre l'identifiant de construction du catalogue et les identifiants de tuiles du renderer.
