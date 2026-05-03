export const DEFAULT_RIGHT_DRAWER_PANELS = ['addDetails'];

export function createRightDrawer({
  documentRef = globalThis.document,
  getShape = () => '',
  setSelectedLocation = () => {},
  panelIds = DEFAULT_RIGHT_DRAWER_PANELS,
} = {}) {
  function open(targetIds, options = {}) {
    const ids = (Array.isArray(targetIds) ? targetIds : [targetIds])
      .filter(id => panelIds.includes(id));
    if (ids.length === 0) return;

    const shape = getShape();
    const useDrawer = shape === 'collection' || shape === 'box' || shape === 'deck';
    if (useDrawer) {
      documentRef.body.classList.add('right-drawer-open');
      panelIds.forEach(id => {
        const el = documentRef.getElementById(id);
        if (el) el.open = ids.includes(id);
      });
    } else {
      ids.forEach(id => {
        const el = documentRef.getElementById(id);
        if (el) el.open = true;
      });
    }

    if (options.seedLocation) {
      setSelectedLocation(options.seedLocation);
    }
    const target = documentRef.getElementById(ids[0]);
    if (target?.scrollIntoView) target.scrollIntoView({ block: 'start' });
  }

  function close() {
    documentRef.body.classList.remove('right-drawer-open');
  }

  function isOpen() {
    return documentRef.body.classList.contains('right-drawer-open');
  }

  return {
    close,
    isOpen,
    open,
  };
}
