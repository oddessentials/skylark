import { assetToPakPath } from './game.mjs';
import { composeTransforms, rotatorToQuaternion } from './geometry.mjs';
import { ObjectRef } from './properties.mjs';

const WORLD_ROOT = 'Pal/Content/Pal/Maps/MainWorld_5/';
const IDENTITY = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

export class World {
  constructor(game) {
    this.game = game;
    this.defaults = new Map();
  }

  findActors(classPattern) {
    const found = [];
    const levels = this.game.pak
      .paths()
      .filter((path) => path.startsWith(WORLD_ROOT) && path.endsWith('.umap'))
      .sort();
    for (const levelPath of levels) {
      const base = levelPath.slice(0, -'.umap'.length);
      const header = this.game.packageAt(base, { withData: false });
      const matches = [];
      for (let i = 1; i <= header.exports.length; i++) {
        const className = header.className(i);
        if (className && classPattern.test(className)) matches.push(i);
      }
      this.game.packages.delete(`${base}|false`);
      if (matches.length === 0) continue;
      const level = this.game.packageAt(base);
      for (const index of matches) {
        found.push({ level, index, className: level.className(index) });
      }
    }
    return found;
  }

  archetype(pkg, index) {
    const templateIndex = pkg.exports[index - 1].templateIndex;
    if (templateIndex >= 0) return templateIndex > 0 ? { pkg, index: templateIndex } : null;
    const chain = pkg.importChain(templateIndex);
    if (chain.length < 2 || !chain[0].startsWith('/Game/')) return null;
    const target = this.game.packageAt(assetToPakPath(chain[0]));
    const name = chain.at(-1);
    const outerName = chain.length > 2 ? chain.at(-2) : undefined;
    const found = target.findExport(name, outerName);
    return found ? { pkg: target, index: found } : null;
  }

  defaultProperties(pkg, index) {
    const key = `${pkg.path}#${index}`;
    if (this.defaults.has(key)) return this.defaults.get(key);
    const parent = this.archetype(pkg, index);
    const inherited = parent ? this.properties(parent.pkg, parent.index) : {};
    this.defaults.set(key, inherited);
    return inherited;
  }

  properties(pkg, index) {
    const own = pkg.properties(index);
    const inherited = this.defaultProperties(pkg, index);
    const merged = {};
    for (const [key, value] of Object.entries(inherited)) {
      if (!(value instanceof ObjectRef)) merged[key] = value;
    }
    return Object.assign(merged, own);
  }

  component(pkg, actorIndex, propertyName) {
    const reference = pkg.properties(actorIndex)[propertyName];
    return reference instanceof ObjectRef && reference.index > 0 ? reference.index : 0;
  }

  worldTransform(pkg, componentIndex, depth = 0) {
    if (depth > 16) throw new Error(`${pkg.path}: attachment chain is too deep`);
    const properties = this.properties(pkg, componentIndex);
    const local = {
      translation: properties.RelativeLocation ?? [0, 0, 0],
      rotation: rotatorToQuaternion(properties.RelativeRotation ?? [0, 0, 0]),
      scale: properties.RelativeScale3D ?? [1, 1, 1]
    };
    const parent = pkg.properties(componentIndex).AttachParent;
    if (!(parent instanceof ObjectRef) || parent.index === 0) return local;
    if (parent.index < 0) throw new Error(`${pkg.path}: component is attached across packages`);
    return composeTransforms(local, this.worldTransform(pkg, parent.index, depth + 1));
  }

  actorTransform(pkg, actorIndex) {
    const root = this.component(pkg, actorIndex, 'RootComponent');
    return root ? this.worldTransform(pkg, root) : IDENTITY;
  }
}
