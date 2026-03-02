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
import { IConfigValueMap, ILocator, IVariableValue, IVariableType_WithDefaultValue, IVariableToSet } from "../internal";
import { IAsyncValue } from "../types";
import { VariableTypeToValueTypeToSet } from "../types/workshopContext";
/**
 * Given the value map, a value locator, and a value,
 * recursively traverses the value map and updates it.
 *
 * @param configValueMap: the entire value map tree, given starting from the root.
 * @param valueLocator: the path to the leaf in the value map tree that needs to have its value updated.
 */
export declare function createNewConfigValueMapWithValueChange(configValueMap: IConfigValueMap, valueLocator: ILocator, value: IAsyncValue<IVariableValue | undefined>): IConfigValueMap;
/**
 * Before setting a value in the context's value map:
 * - for objectSet variables, extract the primaryKeys, which is OSDK's preferred format to load objects with and cap to first 10,000 primaryKeys
 * - for date variables, convert from Date value to string value in format "yyyy-mm-dd"
 * - for date array variables, convert from Date[] value to string[] in format "yyyy-mm-dd" per entry
 */
export declare function maybeTransformValueToSetToValueMapTypes<V extends IVariableType_WithDefaultValue>(variableType: IVariableType_WithDefaultValue, value?: VariableTypeToValueTypeToSet<V>): IVariableValue | undefined;
/**
 * Before sending a value to Workshop:
 * - for objectSet variables, extract the objectRids, which is Workshop's preferred format to load objects with and cap to first 10,000 objectRids
 * - for date variables, convert from Date value to string value in format "yyyy-mm-dd"
 * - for date array variables, convert from Date[] value to string[] in format "yyyy-mm-dd" per entry
 */
export declare function maybeTransformValueToSetToWorkshopValue<V extends IVariableType_WithDefaultValue>(variableType: IVariableType_WithDefaultValue, value?: VariableTypeToValueTypeToSet<V>): IVariableToSet | undefined;
//# sourceMappingURL=utils.d.ts.map