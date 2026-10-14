/* SPDX-License-Identifier: MIT */
(function (root) {
  'use strict';
  const stages = {
    pending: 'Not printed', sliced: 'Sliced / queued', printing: 'Printing',
    printed: 'Printed - inspection / fit pending', fit_checked: 'Fit checked',
    assembled: 'Assembled', finished: 'Finished', needs_rework: 'Needs rework'
  };
  const complete = new Set(['printed', 'fit_checked', 'assembled', 'finished']);
  function validate(data, catalogs) {
    if (!data || data.version !== 1 || !data.parts || typeof data.parts !== 'object' || Array.isArray(data.parts)) {
      throw new Error('Expected progress format version 1 with parts.pack and parts.wand.');
    }
    const result = { version: 1, parts: { pack: {}, wand: {} } };
    for (const kind of Object.keys(data.parts)) {
      if (!['pack', 'wand'].includes(kind)) throw new Error(`Unknown assembly: ${kind}`);
    }
    for (const kind of ['pack', 'wand']) {
      const entries = data.parts[kind];
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`Missing ${kind} progress map.`);
      for (const [key, entry] of Object.entries(entries)) {
        if (!Object.hasOwn(catalogs[kind].parts, key)) throw new Error(`Unknown ${kind} part: ${key}`);
        if (!entry || !Object.hasOwn(stages, entry.status)) throw new Error(`Invalid status for ${key}`);
        if (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.length > 1000)) throw new Error(`Invalid note for ${key}`);
        if (entry.updated_at !== undefined && (typeof entry.updated_at !== 'string' || !Number.isFinite(Date.parse(entry.updated_at)))) throw new Error(`Invalid timestamp for ${key}`);
        result.parts[kind][key] = { status: entry.status };
        if (entry.note !== undefined) result.parts[kind][key].note = entry.note;
        if (entry.updated_at !== undefined) result.parts[kind][key].updated_at = entry.updated_at;
      }
    }
    return result;
  }
  function visualStatus(stage) {
    return complete.has(stage) ? 'printed' : ['sliced', 'printing'].includes(stage) ? 'sliced' : 'pending';
  }
  const api = { stages, complete, validate, visualStatus };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BuildProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
