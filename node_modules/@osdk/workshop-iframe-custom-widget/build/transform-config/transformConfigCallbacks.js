/**
Copyright 2024 Palantir Technologies, Inc.

Licensed under Palantir's License;
you may not use this file except in compliance with the License.
You may obtain a copy of the License from the root of this repository at LICENSE.md

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */
import { MESSAGE_TYPES_TO_WORKSHOP, } from "../internal";
import { asyncValueLoaded, asyncValueReloading, asyncValueLoading, asyncValueFailed, } from "../types";
import { sendMessageToWorkshop } from "../utils";
import { maybeTransformValueToSetToValueMapTypes, createNewConfigValueMapWithValueChange, maybeTransformValueToSetToWorkshopValue, } from "./utils";
/**
 * @returns a function to set a context field as "loaded" with a value
 */
export const createSetLoadedValueCallback = (iframeWidgetId, setConfigValues, valueLocator, variableType) => (value) => {
    const variableValue = maybeTransformValueToSetToValueMapTypes(variableType, value);
    setConfigValues(prevConfigValues => createNewConfigValueMapWithValueChange(prevConfigValues, valueLocator, asyncValueLoaded(variableValue)));
    const valueTypeToSet = maybeTransformValueToSetToWorkshopValue(variableType, value);
    // Only able to send message to workshop if iframeWidgetId was received
    if (iframeWidgetId != null) {
        sendMessageToWorkshop({
            type: MESSAGE_TYPES_TO_WORKSHOP.SETTING_VALUE,
            iframeWidgetId: iframeWidgetId,
            valueLocator,
            // Workshop has null values outside async wrapper 
            value: valueTypeToSet == null
                ? valueTypeToSet
                : asyncValueLoaded(valueTypeToSet),
        });
    }
};
/**
 * @returns a function to set a context field as "reloading" with a value
 */
export const createSetReloadingValueCallback = (iframeWidgetId, setConfigValues, valueLocator, variableType) => (value) => {
    const variableValue = maybeTransformValueToSetToValueMapTypes(variableType, value);
    setConfigValues(prevConfigValues => createNewConfigValueMapWithValueChange(prevConfigValues, valueLocator, asyncValueReloading(variableValue)));
    const valueTypeToSet = maybeTransformValueToSetToWorkshopValue(variableType, value);
    // Only able to send message to workshop if iframeWidgetId was received
    if (iframeWidgetId != null) {
        sendMessageToWorkshop({
            type: MESSAGE_TYPES_TO_WORKSHOP.SETTING_VALUE,
            iframeWidgetId,
            valueLocator,
            // Workshop has null values outside async wrapper
            value: valueTypeToSet == null
                ? valueTypeToSet
                : asyncValueReloading(valueTypeToSet),
        });
    }
};
/**
 * @returns a function to set a context field as "loading"
 */
export const createSetLoadingCallback = (iframeWidgetId, setConfigValues, valueLocator) => () => {
    setConfigValues(prevConfigValues => createNewConfigValueMapWithValueChange(prevConfigValues, valueLocator, asyncValueLoading()));
    // Only able to send message to workshop if iframeWidgetId was received
    if (iframeWidgetId != null) {
        sendMessageToWorkshop({
            type: MESSAGE_TYPES_TO_WORKSHOP.SETTING_VALUE,
            iframeWidgetId,
            valueLocator,
            value: asyncValueLoading(),
        });
    }
};
/**
 * @returns a function to set a context field as "failed" with an error message
 */
export const createSetFailedWithErrorCallback = (iframeWidgetId, setConfigValues, valueLocator) => (error) => {
    setConfigValues(prevConfigValues => createNewConfigValueMapWithValueChange(prevConfigValues, valueLocator, asyncValueFailed(error)));
    // Only able to send message to workshop if iframeWidgetId was received
    if (iframeWidgetId != null) {
        sendMessageToWorkshop({
            type: MESSAGE_TYPES_TO_WORKSHOP.SETTING_VALUE,
            iframeWidgetId,
            valueLocator,
            value: asyncValueFailed(error),
        });
    }
};
/**
 * @returns a function to execute an event in Workshop
 */
export const createExecuteEventCallback = (iframeWidgetId, eventLocator) => (mouseEvent) => {
    // Only able to send message to workshop if iframeWidgetId was received
    if (iframeWidgetId != null) {
        sendMessageToWorkshop({
            type: MESSAGE_TYPES_TO_WORKSHOP.EXECUTING_EVENT,
            iframeWidgetId,
            eventLocator,
            mouseEvent,
        });
    }
};
