import {
  allCollectionLocations,
  locationKey,
  normalizeLocation,
} from './collection.js';
import { esc } from './feedback.js';
import { LOC_ICONS } from './ui/locationUi.js';

export const ADD_LOCATION_TYPES = ['deck', 'binder', 'box'];
export const ADD_LOCATION_DEFAULT = 'box';

function locationTypeValue(doc) {
  const r = doc.querySelector('input[name="addLocationType"]:checked');
  return r ? r.value : ADD_LOCATION_DEFAULT;
}

function setLocationTypeValue(doc, value) {
  doc.querySelectorAll('input[name="addLocationType"]').forEach(r => {
    const checked = r.value === value;
    r.checked = checked;
    const wrap = r.closest('.loc-type-radio');
    if (wrap) wrap.classList.toggle('is-selected', checked);
  });
}

export function buildLocationTypeRadios(doc = document) {
  const wrap = doc.getElementById('addLocationTypeRadios');
  if (!wrap) return;
  wrap.innerHTML = ADD_LOCATION_TYPES.map(t => `<label class="loc-type-radio${t === ADD_LOCATION_DEFAULT ? ' is-selected' : ''}">
    <input type="radio" name="addLocationType" value="${t}"${t === ADD_LOCATION_DEFAULT ? ' checked' : ''}>
    <span class="loc-pill loc-pill-${t}">${LOC_ICONS[t]}<span>${t}</span></span>
  </label>`).join('');
  if (wrap.dataset.bound === '1') return;
  wrap.dataset.bound = '1';
  wrap.addEventListener('change', e => {
    if (e.target.name !== 'addLocationType') return;
    wrap.querySelectorAll('.loc-type-radio').forEach(l => {
      const r = l.querySelector('input');
      l.classList.toggle('is-selected', !!(r && r.checked));
    });
  });
}

export function createAddLocationPicker({
  doc = document,
  getNameInput = () => doc.getElementById('addLocationName'),
  onChange = () => {},
} = {}) {
  let selectedLocation = null;
  let locationNewMode = false;

  function render() {
    const pillsEl = doc.getElementById('addLocationPills');
    const newBoxEl = doc.getElementById('addLocationNewBox');
    if (!pillsEl || !newBoxEl) {
      onChange();
      return;
    }
    const TYPE_HEADERS = { deck: 'decks', binder: 'binders', box: 'boxes' };
    const locations = allCollectionLocations();
    const html = [];
    for (const type of ADD_LOCATION_TYPES) {
      const ofType = locations.filter(l => l.type === type);
      if (ofType.length === 0) continue;
      html.push(`<span class="loc-group-label">${TYPE_HEADERS[type]}</span>`);
      for (const loc of ofType) {
        const isSelected = !locationNewMode && selectedLocation
          && locationKey(selectedLocation) === locationKey(loc);
        html.push(`<button class="location-pill-btn${isSelected ? ' is-selected' : ''}" type="button" data-loc-type="${esc(loc.type)}" data-loc-name="${esc(loc.name)}">
          <span class="loc-pill loc-pill-${esc(loc.type)}">${LOC_ICONS[loc.type]}<span>${esc(loc.name)}</span></span>
        </button>`);
      }
    }
    html.push('<span class="loc-pills-row-break" aria-hidden="true"></span>');
    html.push(`<button class="location-pill-new${locationNewMode ? ' is-selected' : ''}" type="button" id="addLocationNewBtn">+ new location</button>`);
    pillsEl.innerHTML = html.join('');
    newBoxEl.classList.toggle('hidden', !locationNewMode);
    onChange();
  }

  function setSelectedLocation(loc) {
    if (loc && loc.type && loc.name) {
      selectedLocation = { type: loc.type, name: loc.name };
      locationNewMode = false;
    } else {
      selectedLocation = null;
    }
    render();
  }

  function setNewMode(seed) {
    locationNewMode = true;
    selectedLocation = null;
    if (seed && seed.type) setLocationTypeValue(doc, seed.type);
    const nameInput = getNameInput();
    if (nameInput) nameInput.value = seed && seed.name ? seed.name : '';
    render();
    if (nameInput) nameInput.focus();
  }

  function readLocation() {
    if (locationNewMode) {
      return normalizeLocation({ type: locationTypeValue(doc), name: getNameInput()?.value || '' });
    }
    return selectedLocation ? normalizeLocation(selectedLocation) : null;
  }

  function seed(seedValue) {
    const seedLoc = normalizeLocation(seedValue);
    if (!seedLoc) {
      selectedLocation = null;
      locationNewMode = false;
      render();
      return;
    }
    const existing = allCollectionLocations().find(l => locationKey(l) === locationKey(seedLoc));
    if (existing) {
      setSelectedLocation(seedLoc);
    } else {
      setNewMode(seedLoc);
    }
  }

  function snapshot() {
    return {
      selectedLocation: selectedLocation ? { ...selectedLocation } : null,
      locationNewMode,
      locationType: locationTypeValue(doc),
      locationName: getNameInput()?.value || '',
    };
  }

  function restore(snap) {
    if (!snap) return;
    if (snap.locationNewMode) {
      setNewMode({ type: snap.locationType, name: snap.locationName });
    } else if (snap.selectedLocation) {
      setSelectedLocation(snap.selectedLocation);
    } else {
      selectedLocation = null;
      locationNewMode = false;
      render();
    }
  }

  function bindPills() {
    const pillsEl = doc.getElementById('addLocationPills');
    if (!pillsEl || pillsEl.dataset.bound === '1') return;
    pillsEl.dataset.bound = '1';
    pillsEl.addEventListener('click', e => {
      if (e.target.closest('#addLocationNewBtn')) {
        setNewMode();
        return;
      }
      const btn = e.target.closest('.location-pill-btn');
      if (!btn) return;
      setSelectedLocation({ type: btn.dataset.locType, name: btn.dataset.locName });
    });
  }

  return {
    bindPills,
    buildTypeRadios: () => buildLocationTypeRadios(doc),
    readLocation,
    render,
    restore,
    seed,
    setNewMode,
    setSelectedLocation,
    snapshot,
  };
}
