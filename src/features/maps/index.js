import { useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import equal from 'fast-deep-equal';
import {
    mdiImageFilterCenterFocusStrong,
    mdiCity,
    mdiWarehouse,
    mdiFactory,
    mdiStore24Hour,
    mdiNeedle,
    mdiLighthouse,
    mdiTank,
    mdiBeach,
    mdiPineTree,
    mdiEarthBox,
    mdiTunnelOutline,
} from '@mdi/js';

import doFetchMaps from './do-fetch-maps.mjs';
import { langCode, useLangCode } from '../../modules/lang-helpers.js';
import { placeholderMaps } from '../../modules/placeholder-data.js';
import i18n from '../../i18n.js';
import { windowHasFocus } from '../../modules/window-focus-handler.mjs';
import { setDataLoading, setDataLoaded } from '../settings/settingsSlice.mjs';

import rawMapData from '../../data/maps.json';

const initialState = {
    data: placeholderMaps(langCode()),
    status: 'idle',
    error: null,
};

export const fetchMaps = createAsyncThunk('maps/fetchMaps', (arg, { getState }) => {
    const state = getState();
    const gameMode = state.settings.gameMode;
    return doFetchMaps({language: langCode(), gameMode});
});
const mapsSlice = createSlice({
    name: 'maps',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder.addCase(fetchMaps.pending, (state, action) => {
            state.status = 'loading';
        });
        builder.addCase(fetchMaps.fulfilled, (state, action) => {
            state.status = 'succeeded';

            if (!equal(state.data, action.payload)) {
                state.data = action.payload;
            }
        });
        builder.addCase(fetchMaps.rejected, (state, action) => {
            state.status = 'failed';
            console.log(action.error);
            state.error = action.payload;
        });
    },
});

export const mapsReducer = mapsSlice.reducer;

export const selectMaps = (state) => state.maps.data;

let fetchedLang = false;
let fetchedGameMode = false;
let refreshInterval = false;

const clearRefreshInterval = () => {
    clearInterval(refreshInterval);
    refreshInterval = false;
};

export default function useMapsData() {
    const dispatch = useDispatch();
    const { data, status, error } = useSelector((state) => state.maps);
    const lang = useLangCode();
    const gameMode = useSelector((state) => state.settings.gameMode);
    
    useEffect(() => {
        const dataName = 'maps';
        if (status === 'idle') {
            return;
        } else if (status === 'loading') {
            dispatch(setDataLoading(dataName));
        } else {
            dispatch(setDataLoaded(dataName));
        }
    }, [status, dispatch]);

    useEffect(() => {
        if (fetchedLang !== lang || fetchedGameMode !== gameMode) {
            fetchedLang = lang;
            fetchedGameMode = gameMode;
            dispatch(fetchMaps());
            clearRefreshInterval();
        }
        if (!refreshInterval) {
            refreshInterval = setInterval(() => {
                if (!windowHasFocus) {
                    return;
                }
                dispatch(fetchMaps());
            }, 600000);
        }
        return () => {
            clearRefreshInterval();
        };
    }, [dispatch, lang, gameMode]);
    
    return { data, status, error };
};

export const useMapImages = () => {
    const { data: maps } = useMapsData();
    let allMaps = useMemo(() => {
        const mapImages = {};
        const apiImageDataMerge = (mapGroup, imageData, apiData) => {
            mapImages[imageData.key] = {
                id: apiData?.id,
                ...imageData,
                name: apiData?.name || i18n.t(`${mapGroup.normalizedName}-name`, { ns: 'maps' }),
                normalizedName: mapGroup.normalizedName,
                primaryPath: mapGroup.primaryPath,
                displayText: apiData?.name || i18n.t(`${mapGroup.normalizedName}-name`, { ns: 'maps' }),
                description: apiData?.description || i18n.t(`${mapGroup.normalizedName}-description`, { ns: 'maps' }),
                duration: apiData?.raidDuration ? apiData?.raidDuration + ' min' : undefined,
                players: apiData?.players || mapGroup.players,
                image: `/maps/${imageData.key}.jpg`,
                imageThumb: `/maps/${imageData.key}_thumb.jpg`,
                bosses: apiData?.bosses.map(bossSpawn => {
                    return {
                        name: bossSpawn.name,
                        normalizedName: bossSpawn.normalizedName,
                        spawnChance: bossSpawn.spawnChance,
                        spawnLocations: bossSpawn.spawnLocations,
                    }
                }),
                spawns: apiData?.spawns || [],
                extracts: apiData?.extracts || [],
                transits: apiData?.transits || [],
                locks: apiData?.locks || [],
                hazards: apiData?.hazards || [],
                lootContainers: apiData?.lootContainers || [],
                lootLoose: apiData?.lootLoose ?? [],
                switches: apiData?.switches || [],
                stationaryWeapons: apiData?.stationaryWeapons || [],
                artillery: apiData?.artillery,
            };
            mapImages[imageData.key].displayVariant = i18n.t(imageData.projection, { ns: 'maps' });
            if (imageData.orientation) {
                mapImages[imageData.key].displayVariant += ` - ${i18n.t(imageData.orientation, { ns: 'maps' })}`;
            }
            if (imageData.specific) {
                mapImages[imageData.key].displayVariant += ` - ${i18n.t(imageData.specific, { ns: 'maps' })}`;
            }
            if (imageData.extra) {
                mapImages[imageData.key].displayVariant += ` - ${imageData.extra}`;
            }
            mapImages[imageData.key].displayText += ` - ${mapImages[imageData.key].displayVariant}`;

            if (imageData.suppress) {
                mapImages[imageData.key].displayVariant += ` - ${mapImages[imageData.key].name}`;
            }

            if (imageData.altMaps) {
                for (const altKey of imageData.altMaps) {
                    const altApiMap = maps.find(map => map.normalizedName === altKey);
                    if (!altApiMap) {
                        // alt map is missing; so we skip it
                        continue;
                    }
                    apiImageDataMerge(mapGroup, {
                        ...imageData,
                        key: altKey,
                        altMaps: undefined,
                        suppress: true,
                    }, altApiMap);
                }
            }
        };
        for (const mapsGroup of rawMapData) {
            const apiMap = maps.find(map => map.normalizedName === mapsGroup.normalizedName);
            for (const map of mapsGroup.maps) {
                apiImageDataMerge(mapsGroup, map, apiMap);
            }
        }
        return mapImages;
    }, [maps]);
    return allMaps;
};

export const useMapImagesSortedArray = () => {
    let mapArray = Object.values(useMapImages())
    
    mapArray.sort((a, b) => {
        if (a.normalizedName === 'openworld')
            return 1;
        if (b.normalizedName === 'openworld')
            return -1;
        return a.name.localeCompare(b.name);
    });

    return mapArray
}

export const mapIcons = {
    'ground-zero': mdiImageFilterCenterFocusStrong,
    'streets-of-tarkov': mdiCity,
    'customs': mdiWarehouse,
    'factory': mdiFactory,
    'interchange': mdiStore24Hour,
    'the-lab': mdiNeedle,
    'the-labyrinth': mdiTunnelOutline,
    'lighthouse': mdiLighthouse,
    'reserve': mdiTank,
    'shoreline': mdiBeach,
    'woods': mdiPineTree,
    'openworld': mdiEarthBox,
};
