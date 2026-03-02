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
import { IVariableType_WithDefaultValue, ILocator, IConfigValueMap } from "../internal";
import { VariableTypeToValueTypeToSet } from "../types/workshopContext";
/**
 * @returns a function to set a context field as "loaded" with a value
 */
export declare const createSetLoadedValueCallback: <V extends IVariableType_WithDefaultValue>(iframeWidgetId: string | undefined, setConfigValues: React.Dispatch<React.SetStateAction<IConfigValueMap>>, valueLocator: ILocator, variableType: IVariableType_WithDefaultValue) => (value?: VariableTypeToValueTypeToSet<V>) => void;
/**
 * @returns a function to set a context field as "reloading" with a value
 */
export declare const createSetReloadingValueCallback: <V extends IVariableType_WithDefaultValue>(iframeWidgetId: string | undefined, setConfigValues: React.Dispatch<React.SetStateAction<IConfigValueMap>>, valueLocator: ILocator, variableType: IVariableType_WithDefaultValue) => (value?: VariableTypeToValueTypeToSet<V>) => void;
/**
 * @returns a function to set a context field as "loading"
 */
export declare const createSetLoadingCallback: (iframeWidgetId: string | undefined, setConfigValues: React.Dispatch<React.SetStateAction<IConfigValueMap>>, valueLocator: ILocator) => () => void;
/**
 * @returns a function to set a context field as "failed" with an error message
 */
export declare const createSetFailedWithErrorCallback: (iframeWidgetId: string | undefined, setConfigValues: React.Dispatch<React.SetStateAction<IConfigValueMap>>, valueLocator: ILocator) => (error: string) => void;
/**
 * @returns a function to execute an event in Workshop
 */
export declare const createExecuteEventCallback: (iframeWidgetId: string | undefined, eventLocator: ILocator) => (mouseEvent?: MouseEvent) => void;
//# sourceMappingURL=transformConfigCallbacks.d.ts.map