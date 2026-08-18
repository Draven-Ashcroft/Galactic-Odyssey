/**
 * scenes/sceneRegistry.js
 * ------------------------------------------------------------------
 * Maps each epoch id (from data/epochs.js) to the Scene class that
 * should render it. This is the ONE file that needs to change to add
 * a real scene later — SceneManager, EpochStateMachine, and main.js
 * never need to know a new scene class exists.
 *
 * To add a dedicated scene:
 *   1. Create js/scenes/epochs/CosmicWebScene.js (for example),
 *      extending BaseScene and implementing enter/update/exit.
 *   2. Import it below and replace its entry in SCENE_REGISTRY.
 * Nothing else in the app needs to change.
 *
 * Every epoch now has a dedicated scene - this file's job is done.
 */
import { EPOCHS } from '../data/epochs.js';
import { PlaceholderScene } from './PlaceholderScene.js';
import { CosmicWebScene } from './epochs/CosmicWebScene.js';
import { FirstStarsScene } from './epochs/FirstStarsScene.js';
import { GalaxyFormationScene } from './epochs/GalaxyFormationScene.js';
import { EarlyUniverseScene } from './epochs/EarlyUniverseScene.js';
import { AtomFormationScene } from './epochs/AtomFormationScene.js';
import { DarkAgesScene } from './epochs/DarkAgesScene.js';
import { MilkyWayScene } from './epochs/MilkyWayScene.js';
import { SolarNebulaScene } from './epochs/SolarNebulaScene.js';
import { ProtoplanetaryDiskScene } from './epochs/ProtoplanetaryDiskScene.js';
import { PlanetesimalFormationScene } from './epochs/PlanetesimalFormationScene.js';
import { PresentDaySolarSystemScene } from './epochs/PresentDaySolarSystemScene.js';

/** epoch.id -> Scene class (constructor reference, not an instance). */
export const SCENE_REGISTRY = Object.fromEntries(
  EPOCHS.map((epoch) => [epoch.id, PlaceholderScene])
);
SCENE_REGISTRY['cosmic-web'] = CosmicWebScene;
SCENE_REGISTRY['first-stars'] = FirstStarsScene;
SCENE_REGISTRY['galaxy-formation'] = GalaxyFormationScene;
// Same class for both - they're one continuous physical process split
// across two epoch slots. See EarlyUniverseScene.js's file header.
SCENE_REGISTRY['early-universe'] = EarlyUniverseScene;
SCENE_REGISTRY['expansion-cooling'] = EarlyUniverseScene;
SCENE_REGISTRY['atom-formation'] = AtomFormationScene;
SCENE_REGISTRY['dark-ages'] = DarkAgesScene;
SCENE_REGISTRY['milky-way'] = MilkyWayScene;
SCENE_REGISTRY['solar-nebula'] = SolarNebulaScene;
SCENE_REGISTRY['protoplanetary-disk'] = ProtoplanetaryDiskScene;
SCENE_REGISTRY['planetesimal-formation'] = PlanetesimalFormationScene;
SCENE_REGISTRY['present-day'] = PresentDaySolarSystemScene;

/** Look up the Scene class for an epoch, falling back to PlaceholderScene. */
export function resolveSceneClass(epochId) {
  return SCENE_REGISTRY[epochId] ?? PlaceholderScene;
}
