// ==UserScript==
// @name         Show Total Lesson Count - WaniKani
// @namespace    https://codeberg.org/lupomikti
// @version      0.6.3
// @description  Add the count of total lessons to the Today's Lessons widget
// @license      MIT
// @author       LupoMikti
// @match        https://www.wanikani.com/*
// @grant        none
// @supportURL   https://github.com/lupomikti/Userscripts/issues
// @downloadURL https://update.greasyfork.org/scripts/486798/Show%20Total%20Lesson%20Count%20-%20WaniKani.user.js
// @updateURL https://update.greasyfork.org/scripts/486798/Show%20Total%20Lesson%20Count%20-%20WaniKani.meta.js
// ==/UserScript==

// Additional supportURL: https://community.wanikani.com/t/userscript-show-total-lesson-count/66776

(async function () {
    'use strict';

    /* global wkof */

    const scriptId = 'show_total_lesson_count';
    const scriptName = 'Show Total Lesson Count';

    const globalState = {
        initialLoad: true,
        stateStarting: false,
        todaysLessonsFrameLoaded: false,
        navBarCountFrameLoaded: false,
        hasOutputLog: false,
        turboEventBusy: false,
        mainRetryCounter: 4,
    };

    let debugLogText = `START: ${scriptName} Debug Log:\n`;
    let mainSource = '';
    const INTERNAL_DEBUG_TURBO_HANDLING = false;

    let todaysLessonsCount;
    let settings;

    function addToDebugLog(message) {
        debugLogText += `${new Date().toISOString()}: ${message}\n`;
    }

    function printDebugLog(force = false) {
        if (!globalState.hasOutputLog || force) {
            console.log(`${scriptName}: Outputting a debug log to console.debug()\nTo disable this setting, open "Settings > ${scriptName}" and toggle "Enable console debugging" off`);
            console.debug(debugLogText);
        }
        if (!force) globalState.hasOutputLog = true;
        debugLogText = `START: ${scriptName} Debug Log:\n`;
    }

    if (!window.wkof) {
        if (confirm(scriptName + ' requires Wanikani Open Framework.\nDo you want to be forwarded to the installation instructions?')) {
            window.location.href = 'https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549';
        }
        return;
    }

    const wkofTurboEventsScriptUrl = 'https://update.greasyfork.org/scripts/501980/1426289/Wanikani%20Open%20Framework%20Turbo%20Events.user.js';
    addToDebugLog(`Attempting to load the TurboEvents library script...`)
    await wkof.load_script(wkofTurboEventsScriptUrl, /* use_cache */ true);
    addToDebugLog(`Checking if TurboEvents library script is loaded in...`)
    const injectedDependency = document.head.querySelector('script[uid*="Turbo"]');
    addToDebugLog(`Turbo Events library ${injectedDependency ? 'is' : 'is NOT'} loaded.`);

    if (INTERNAL_DEBUG_TURBO_HANDLING) {
        window.addEventListener('turbo:load', () => { console.log(`DEBUG: turbo:load has fired`); });
        window.addEventListener('turbo:before-frame-render', (e) => { console.log(`DEBUG: turbo:before-frame-render has fired for '#${e.target.id}'`); });
        window.addEventListener('turbo:frame-load', (e) => { console.log(`DEBUG: turbo:frame-load has fired for '#${e.target.id}'`); });
    }

    const _init = async (source) => {
        if (globalState.stateStarting) { addToDebugLog(`SOURCE = "${source}" | We are already in the starting state, no need to initialize, returning...`); return; }
        addToDebugLog(`SOURCE = "${source}" | Setting global state and calling _start()`);
        globalState.initialLoad = globalState.stateStarting = true;
        globalState.hasOutputLog = globalState.todaysLessonsFrameLoaded = false;
        await _start();
    };

    wkof.ready('TurboEvents').then(() => {
        addToDebugLog(`Start of TurboEvents ready callback`);

        const urlList = [
            wkof.turbo.common.locations.dashboard,
            // wkof.turbo.common.locations.items_pages,
            // vvvv Any page with the nav bar that's not one of the above locations vvvv
            // /^https:\/\/www\.wanikani\.com\/(settings|level|radicals|kanji|vocabulary)(\/|\?difficulty=).+\/?$/,
        ];

        wkof.turbo.events.load.addListener(async (_e) => {
            globalState.turboEventBusy = true;
            await _init('turbo:load').then(() => { globalState.turboEventBusy = false });
        }, { urls: urlList, passive: true });

        wkof.turbo.events.before_frame_render.addListener(async (e) => {
            globalState.turboEventBusy = true;
            const frameId = e.target.id;
            addToDebugLog(`turbo:before-frame-render has fired for "#${frameId}"`);
            if (globalState.initialLoad && !globalState.stateStarting) {
                addToDebugLog(`globalState.initialLoad is true (no frames were previously retrieved) and we are not already in starting state, starting initialization sequence...`);
                await _init('turbo:before-frame-render');
                return;
            }
            if (frameId === 'todays-lessons-frame') {
                globalState.todaysLessonsFrameLoaded = false;
            }
            else if (frameId === 'lesson-and-review-count-frame') {
                globalState.navBarCountFrameLoaded = false;
            }
        }, { urls: urlList, passive: true });

        wkof.turbo.events.frame_load.addListener(async (e) => {
            const frameId = e.target.id;
            addToDebugLog(`turbo:frame-load was fired for "#${frameId}", ${['todays-lessons-frame', 'lesson-and-review-count-frame'].includes(frameId) ? 'calling main function' : 'doing nothing...'}`);
            if (!globalState.stateStarting) {
                addToDebugLog(`DETOUR - turbo:frame-load was fired before we could begin starting or after main fully finished before frame events fired; changing following invocations of main() to _start() if we are not 'doing nothing'`);
            }
            mainSource = `turbo:frame-load for "#${frameId}"`;
            if (frameId === 'todays-lessons-frame') {
                globalState.todaysLessonsFrameLoaded = true;
                if (!globalState.stateStarting) { globalState.stateStarting = true; await _start(); return; }
                await main();
            }
            else if (frameId === 'lesson-and-review-count-frame') {
                globalState.navBarCountFrameLoaded = true;
                if (!globalState.stateStarting) { globalState.stateStarting = true; await _start(); return; }
                await main();
            }
            mainSource = '';
            globalState.turboEventBusy = false;
        }, { urls: urlList, passive: true });

        addToDebugLog(`All turbo callbacks have been sent to TurboEvents library to be registered`);
    }).catch((err) => { addToDebugLog(`TurboEvents library rejected with error: ${err}`); })
        .finally(() => {
            if (INTERNAL_DEBUG_TURBO_HANDLING) {
                addToDebugLog(`SOURCE = "turbo ready finally"`);
                printDebugLog(INTERNAL_DEBUG_TURBO_HANDLING);
            }
            _init(`wkof.ready('TurboEvents') finally callback`);
        });

    async function _start() {
        addToDebugLog(`Starting...`);
        wkof.include('Settings, Menu, Apiv2');
        await wkof.ready('Settings, Menu, Apiv2').then(loadSettings).then(insertMenu).then(insertStylesheet).then(main)
            .catch((err) => { addToDebugLog(`wkof.ready('Settings, Menu, Apiv2') rejected (or callbacks threw an exception) with error: ${err}`); })
            .finally(() => { if (INTERNAL_DEBUG_TURBO_HANDLING) { addToDebugLog(`SOURCE = "wkof modules ready finally"`); printDebugLog(INTERNAL_DEBUG_TURBO_HANDLING); } });
    }

    function loadSettings() {
        addToDebugLog(`Loading settings...`);

        const defaults = {
            showTotalOnly: false,
            enableDebugging: true,
        };

        return wkof.Settings.load(scriptId, defaults).then(function (wkof_settings) { settings = wkof_settings; });
    }

    function insertMenu() {
        addToDebugLog(`Inserting menu...`);

        const config = {
            name: scriptId,
            submenu: 'Settings',
            title: scriptName,
            on_click: openSettings
        };

        wkof.Menu.insert_script_link(config);
        mainSource = `_start() -> loadSettings() -> insertMenu()`;
    }

    async function saveSettings(wkof_settings) {
        globalState.hasOutputLog = false;
        addToDebugLog(`Save button was clicked on settings, calling main() with new settings...`);
        mainSource = 'wkof.Settings.save()';
        settings = wkof_settings;
        await main();
        mainSource = '';
    }

    function openSettings() {
        const config = {
            script_id: scriptId,
            title: scriptName,
            on_save: saveSettings,
            content: {
                showTotalOnly: {
                    type: 'checkbox',
                    label: 'Show Only Total Lesson Count',
                    hover_tip: `Changes display between "<today's lesson count> / <total lesson count>" and just "<total lesson count>"`,
                    default: false,
                },
                enableDebugging: {
                    type: 'checkbox',
                    label: 'Enable console debugging',
                    hover_tip: `Enable output of debugging info to console.debug()`,
                    default: true,
                }
            }
        };

        const dialog = new wkof.Settings(config);
        dialog.open();
    }

    function insertStylesheet() {
        const css = `
.todays-lessons-widget__title-container:has(.todays-lessons-widget__title-group-container) {
  display: inline-flex;
  gap: var(--spacing-normal);
  justify-content: space-evenly;
}

.todays-lessons-widget__title-group-container {
  display: flex;
  flex-direction: column;
}

.todays-lessons-widget__title-group-container .todays-lessons-widget__subtitle {
  margin-top: 2px;
}

.todays-lessons-widget__title-container:has(.todays-lessons-widget__title-group-container) + .todays-lessons-widget__text {
  align-self: center;
}

.todays-lessons-widget__title:has(.todays-lessons-widget__text-wrapper) {
  flex-direction: column;
}

.todays-lessons-widget__text-wrapper {
  display: flex;
  gap: var(--spacing-tight);
  align-items: center;
}
`;
        if (document.getElementById('total-lesson-count-style') === null) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'total-lesson-count-style';
            styleSheet.textContent = css;
            document.head.appendChild(styleSheet);
        }
    }

    function getCountContainer() {
        const dashboardTileCountContainer = document.querySelector('.todays-lessons-widget__count-text .count-bubble');

        if (globalState.initialLoad && (dashboardTileCountContainer)) {
            const container = dashboardTileCountContainer;
            todaysLessonsCount = parseInt(container.textContent);
            globalState.initialLoad = false;
        }

        return dashboardTileCountContainer;
    }

    async function main() {
        addToDebugLog(`Main function is executing... source of start = [${mainSource}]`);

        if (!settings) {
            addToDebugLog(`We do not have settings, setting timeout on _start()`);
            if (!globalState.stateStarting) { setTimeout(_start, 50); }
            else addToDebugLog(`Did not set timeout due to already being in starting state`);
            addToDebugLog(`Main function is returning (source = [${mainSource}])`);
            return;
        }
        addToDebugLog(`We have settings`);

        addToDebugLog(`Retrieving summary data via await of the endpoint...`);
        const summary_data = await wkof.Apiv2.get_endpoint('summary');
        addToDebugLog(`Summary data has been retrieved`);

        if (!globalState.stateStarting && globalState.hasOutputLog) {
            globalState.hasOutputLog = false;
            addToDebugLog(`Main function successfully executed beforehand, preventing repeat execution...`);
            if (settings.enableDebugging) printDebugLog(INTERNAL_DEBUG_TURBO_HANDLING);
            return;
        }

        const totalLessonCount = summary_data.lessons[0].subject_ids.length;
        let lessonCountContainer;
        let isTileSizeOneThird = false;

        if (globalState.todaysLessonsFrameLoaded) {
            addToDebugLog(`Frame loaded, retrieving container in frame containing the count...`);
            lessonCountContainer = getCountContainer();
            addToDebugLog(`Count container has been retrieved`);
        }
        else {
            addToDebugLog(`No frames loaded, checking to see if all listened-to turbo events have settled...`);
            addToDebugLog(`starting = ${globalState.stateStarting}, turboEventBusy = ${globalState.turboEventBusy}, retries = ${globalState.mainRetryCounter}`)
            if (globalState.stateStarting && !globalState.turboEventBusy && globalState.mainRetryCounter > 0) {
                addToDebugLog(`Turbo Events have settled but we have not verified frames, using alternate verification...`);
                const tmpContainer = document.querySelector('.todays-lessons-widget__count-text');
                if (tmpContainer && tmpContainer.childElementCount > 0) globalState.todaysLessonsFrameLoaded = true;
                mainSource = 'main() function, no frames alternate verification';
                globalState.mainRetryCounter--;
                addToDebugLog(`Alternate verification process completed, retrying main(), ${globalState.mainRetryCounter} retries left...`);
                await main();
                mainSource = ''
                return;
            }
            else if (globalState.mainRetryCounter === 0) {
                addToDebugLog(`Unable to verify loading of frames through alternate method, please refresh the page to try again from scratch`);
                globalState.mainRetryCounter = 4; // failure, reseting the counter for the next series of turbo events
            }
            else {
                addToDebugLog(`Turbo event callbacks are still executing, continuing...`);
            }
            addToDebugLog(`Main function is returning (source = [${mainSource}])`);
            //if (settings.enableDebugging) printDebugLog(INTERNAL_DEBUG_TURBO_HANDLING);
            return;
        }

        let todaysCountForDisplay = todaysLessonsCount;

        if (lessonCountContainer == null) {
            addToDebugLog(`Container is null`);
            addToDebugLog(`Main function is returning (source = [${mainSource}])`);
            //if (settings.enableDebugging) printDebugLog(INTERNAL_DEBUG_TURBO_HANDLING);
            return;
        }
        addToDebugLog(`Container exists`);
        globalState.stateStarting = false;

        if (isNaN(todaysLessonsCount)) todaysCountForDisplay = 0;

        if (lessonCountContainer) {
            if (settings.showTotalOnly) {
                lessonCountContainer.textContent = totalLessonCount;
                addToDebugLog(`Setting display amount for Today's Lessons tile, set to ${lessonCountContainer.textContent}`);
            }
            else {
                // The following follows no style conventions or cleanliness conventions, it's more akin to a bandaid than anything due to limited time
                // If anyone would like to clean this up, please feel free to submit a PR

                globalState.mainRetryCounter = 4; // success, reseting the counter for the next series of turbo events
                lessonCountContainer.textContent = todaysCountForDisplay; // in case it is zero
                const titleContainer = lessonCountContainer.parentNode.parentNode.parentNode; // .todays-lessons-widget__title-container
                isTileSizeOneThird = titleContainer.closest('turbo-frame.dashboard__widget--one-third') != null;

                if (isTileSizeOneThird) {
                    // Do the one-third stuff
                    const wrapper0 = document.createElement('div');
                    wrapper0.classList.add(`todays-lessons-widget__text-wrapper`);
                    titleContainer.querySelector(`.todays-lessons-widget__title`)?.firstElementChild?.insertAdjacentElement('afterend', wrapper0);

                    // There is a bug that cause the first element of wrapper0 to disappear from the DOM
                    // on an intermitent basis. There is no visible bug in the script. We can only protect
                    // the script from the effect of the bug by putting a dummy element in the first position.
                    const countTextDivDummy = titleContainer.querySelector(`.todays-lessons-widget__count-text`);
                    const countTextDiv = countTextDivDummy.cloneNode(true);
                    const countTextClone = countTextDivDummy.cloneNode(true);
                    countTextClone.firstElementChild.textContent = totalLessonCount;
                    const forwardSlash = document.createElement('div');
                    forwardSlash.classList.add("todays-lessons-widget__title-text");
                    forwardSlash.textContent = '/';
                    const forwardSlashDummy = forwardSlash.cloneNode(true);
                    forwardSlashDummy.style.display = "none";
                    countTextDivDummy.style.display = "none";
                    wrapper0.append(countTextDivDummy);
                    wrapper0.append(forwardSlashDummy);
                    wrapper0.append(countTextDiv);
                    wrapper0.append(forwardSlash);
                    wrapper0.append(countTextClone);

                    addToDebugLog(`Manipulated DOM and created new nodes as needed.`);
                }
                else {
                    // Do things that should only be done if one-half, wo-thirds or full row
                    if (!titleContainer.children[0].className.includes(`__title-group-container`)) {
                        // clone existing children, and modify clones to make new children, store in a temp array
                        const tempArray = [];
                        for (const elem of titleContainer.children) {
                            const clone = elem.cloneNode(true);
                            if (clone.className.includes(`__subtitle`)) {
                                clone.textContent = "Total";
                            }
                            if (clone.className.includes(`__title`)) {
                                const tmpNode = clone.querySelector(`.todays-lessons-widget__count-text .count-bubble`);
                                if (tmpNode) tmpNode.textContent = totalLessonCount;
                            }
                            tempArray.push(clone);
                        }

                        // wrap the existing children in a new div.todays-lessons-widget__title-group-container
                        // wrap the new children in the same kind of wrapper
                        // append second wrapper after first wrapper

                        const wrapper1 = document.createElement('div');
                        wrapper1.classList.add(`todays-lessons-widget__title-group-container`);
                        titleContainer.insertAdjacentElement('beforebegin', wrapper1);
                        wrapper1.append(...titleContainer.children);
                        titleContainer.prepend(wrapper1); // this should move the wrapper inside titleContainer

                        const wrapper2 = document.createElement('div');
                        wrapper2.classList.add(`todays-lessons-widget__title-group-container`);
                        titleContainer.insertAdjacentElement('beforebegin', wrapper2);
                        wrapper2.append(...tempArray);
                        titleContainer.append(wrapper2);

                        addToDebugLog(`Created additional cloned nodes to display Total Lesson Count.`);
                    }
                }
            }
        }

        // hide "Today's" subtitle if showing only total OR if tile is only of size one-third

        const lessonSubtitle = document.querySelector('.todays-lessons-widget__subtitle');

        if ((settings.showTotalOnly || isTileSizeOneThird) && lessonSubtitle && lessonSubtitle.checkVisibility()) {
            addToDebugLog(`Hiding the "Today's" subtitle on the lesson tile`);
            lessonSubtitle.style.display = 'none';
        }

        addToDebugLog(`Main function has successfully executed`);

        if (settings.enableDebugging) printDebugLog(INTERNAL_DEBUG_TURBO_HANDLING);
    }
})();
