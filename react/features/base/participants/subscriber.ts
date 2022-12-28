import _ from 'lodash';

import { IStore } from '../../app/types';
import { getCurrentConference } from '../conference/functions';
import {
    getMultipleVideoSendingSupportFeatureFlag,
    getSsrcRewritingFeatureFlag
} from '../config/functions.any';
import { VIDEO_TYPE } from '../media/constants';
import StateListenerRegistry from '../redux/StateListenerRegistry';

import { createVirtualScreenshareParticipant, participantLeft } from './actions';
import { getRemoteScreensharesBasedOnPresence } from './functions';
import { FakeParticipant } from './types';

StateListenerRegistry.register(
    /* selector */ state => state['features/base/tracks'],
    /* listener */(tracks, store) => _updateScreenshareParticipants(store)
);

StateListenerRegistry.register(
    /* selector */ state => state['features/base/participants'],
    /* listener */(participants, store) => getSsrcRewritingFeatureFlag(store.getState())
        && _updateScreenshareParticipantsBasedOnPresence(store)
);

/**
 * Compares the old and new screenshare lists provided and creates/removes the virtual screenshare participant
 * tiles accodingly.
 *
 * @param {Array<string>} oldScreenshareSourceNames - List of old screenshare source names.
 * @param {Array<string>} newScreenshareSourceNames - Current list of screenshare source names.
 * @param {Object} store - The redux store.
 * @returns {void}
 */
function _createOrRemoveVirtualParticipants(
        oldScreenshareSourceNames: string[],
        newScreenshareSourceNames: string[],
        store: IStore): void {
    const { dispatch, getState } = store;
    const conference = getCurrentConference(getState());
    const removedScreenshareSourceNames = _.difference(oldScreenshareSourceNames, newScreenshareSourceNames);
    const addedScreenshareSourceNames = _.difference(newScreenshareSourceNames, oldScreenshareSourceNames);

    if (removedScreenshareSourceNames.length) {
        removedScreenshareSourceNames.forEach(id => dispatch(participantLeft(id, conference, {
            fakeParticipant: FakeParticipant.RemoteScreenShare,
            isReplaced: undefined
        })));
    }

    if (addedScreenshareSourceNames.length) {
        addedScreenshareSourceNames.forEach(id => dispatch(
            createVirtualScreenshareParticipant(id, false, conference)));
    }
}

/**
 * Handles creating and removing virtual screenshare participants.
 *
 * @param {*} store - The redux store.
 * @returns {void}
 */
function _updateScreenshareParticipants(store: IStore): void {
    const { dispatch, getState } = store;
    const state = getState();
    const conference = getCurrentConference(state);
    const tracks = state['features/base/tracks'];
    const { sortedRemoteVirtualScreenshareParticipants, localScreenShare } = state['features/base/participants'];
    const previousScreenshareSourceNames = [ ...sortedRemoteVirtualScreenshareParticipants.keys() ];

    let newLocalSceenshareSourceName;

    const currentScreenshareSourceNames = tracks.reduce((acc: string[], track) => {
        if (track.videoType === VIDEO_TYPE.DESKTOP && !track.jitsiTrack.isMuted() && !track.orphaned) {
            const sourceName: string = track.jitsiTrack.getSourceName();

            if (track.local) {
                newLocalSceenshareSourceName = sourceName;
            } else {
                acc.push(sourceName);
            }
        }

        return acc;
    }, []);

    if (getMultipleVideoSendingSupportFeatureFlag(state)) {
        if (!localScreenShare && newLocalSceenshareSourceName) {
            dispatch(createVirtualScreenshareParticipant(newLocalSceenshareSourceName, true, conference));
        }

        if (localScreenShare && !newLocalSceenshareSourceName) {
            dispatch(participantLeft(localScreenShare.id, conference, {
                fakeParticipant: FakeParticipant.LocalScreenShare,
                isReplaced: undefined
            }));
        }
    }

    if (getSsrcRewritingFeatureFlag(state)) {
        return;
    }

    _createOrRemoveVirtualParticipants(previousScreenshareSourceNames, currentScreenshareSourceNames, store);
}

/**
 * Handles the creation and removal of remote virtual screenshare participants when ssrc-rewriting is enabled.
 *
 * @param {Object} store - The redux store.
 * @returns {void}
 */
function _updateScreenshareParticipantsBasedOnPresence(store: IStore): void {
    const { getState } = store;
    const state = getState();
    const { sortedRemoteVirtualScreenshareParticipants } = state['features/base/participants'];
    const previousScreenshareSourceNames = [ ...sortedRemoteVirtualScreenshareParticipants.keys() ];
    const currentScreenshareSourceNames = getRemoteScreensharesBasedOnPresence(state);

    _createOrRemoveVirtualParticipants(previousScreenshareSourceNames, currentScreenshareSourceNames, store);
}
