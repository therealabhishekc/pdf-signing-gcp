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
import { IMessageToWorkshop } from "./internal";
/**
 * Sends a message to Workshop through the parent window
 */
export declare function sendMessageToWorkshop(message: IMessageToWorkshop): void;
/**
 * Throws an error when a value isn't a `never` as expected. Used for guaranteeing exhaustive checks
 * and preventing further code from running when in an unexpected state.
 *
 * @param message A description of why a `never` type is expected.
 * @param value   The value that should be `never`.
 */
export declare function assertNever(message: string, value: never): never;
/**
 * Detect whether app is being iframed. Excludes Palantir Foundry's VS code workspaces for the purposes of development.
 */
export declare function isInsideIframe(): boolean;
/**
 * Given a Date object, returns the string representation of the date in format "yyyy-mm-dd"
 */
export declare function formatDate(date: Date): string;
//# sourceMappingURL=utils.d.ts.map