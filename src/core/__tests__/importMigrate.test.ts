/**
 * Project migrate upgrades older docs so imported video assets gain a recording sidecar.
 */

import { describe, expect, it } from 'vitest';
import { createProject, createVideoLayer } from '../defaults';
import type { MediaAsset } from '../types';
import { SCHEMA_VERSION } from '../types';
import { migrateProject } from '../../platform/projectStore';

describe('import recording migration', () => {
  it('seeds empty import recording on legacy video assets', () => {
    const project = createProject('Legacy');
    project.schemaVersion = 2;
    const asset: MediaAsset = {
      id: 'old',
      kind: 'video',
      name: 'old-import.mp4',
      storageKey: 'old.mp4',
      mimeType: 'video/mp4',
      byteSize: 1000,
      duration: 4,
      width: 1920,
      height: 1080,
      createdAt: Date.now(),
    };
    project.assets.push(asset);
    project.scenes[0].layers.push(createVideoLayer(asset.id, { duration: 4 }));

    const upgraded = migrateProject(project);
    expect(upgraded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(upgraded.assets[0].recording?.source).toBe('import');
    expect(upgraded.assets[0].recording?.cursor).toEqual([]);
  });
});
