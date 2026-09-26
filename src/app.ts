import { LocalStorageSaveProvider } from './platform/SaveProvider';
import { ProfileStore } from './meta/profile';

export { session } from './meta/profile';

export const storage = new LocalStorageSaveProvider('cozy-solitaire-save');
export const profile = new ProfileStore(storage);
