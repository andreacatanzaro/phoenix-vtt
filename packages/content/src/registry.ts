import type { ClassDefinition, FeatureDefinition, SubclassDefinition } from "@phoenix/rules-srd";
import { champion } from "./classes/fighter/champion";
import { fighter } from "./classes/fighter/fighter";
import { FIGHTING_STYLES } from "./classes/fighter/fighting-styles";

/** A class with its subclasses. Add every new class here: the coverage report and the checks read this list. */
export type ContentClass = {
  class: ClassDefinition;
  subclasses: readonly SubclassDefinition[];
  /** Choices the class offers that are not features themselves (fighting styles), listed in the coverage report. */
  options: readonly Pick<FeatureDefinition, "id" | "nameKey" | "descriptionKey" | "source" | "automation" | "dmNoteKey">[];
};

export const contentClasses: readonly ContentClass[] = [{ class: fighter, subclasses: [champion], options: FIGHTING_STYLES }];
