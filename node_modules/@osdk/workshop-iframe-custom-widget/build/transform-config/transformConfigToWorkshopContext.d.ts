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
import { IConfigDefinition, IWorkshopContext } from "../types";
import { IConfigValueMap, ILocator, IVariableType_WithDefaultValue } from "../internal";
/**
 * A recursive transformation function that given a config definition, returns a context object with
 * strongly typed properties and property value types from a given config definition.
 *
 * @param config: IConfigDefinition, a list of config fields and their full definition.
 * @param configValues: the map of values that populates the values of the config's properties.
 * @param opts: optionally contains a callback function `createLocatorInListCallback` to create a nested ILocator,
 * which is used when calling the function recursively.
 *
 * @returns IWorkshopContext, the context object.
 */
export declare function transformConfigWorkshopContext<T extends IConfigDefinition, V extends IVariableType_WithDefaultValue>(config: T, configValues: IConfigValueMap, setConfigValues: React.Dispatch<React.SetStateAction<IConfigValueMap>>, iframeWidgetId: string | undefined, opts?: {
    createLocatorInListCallback: (locator: ILocator) => ILocator;
}): IWorkshopContext<T>;
//# sourceMappingURL=transformConfigToWorkshopContext.d.ts.map