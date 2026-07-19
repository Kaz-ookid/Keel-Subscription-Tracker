// The guided-generation schema for the assistant: a Swift mirror of the plan
// JSON core's parseAssistantPlan consumes ({"actions":[...],"additions":[...],
// "note":...}). Same philosophy as ImportSchema: the constrained decode makes
// the model physically unable to emit anything outside the contract; every
// value check (does the item exist? is the date sane?) stays in core, and
// nothing applies without the user's review.

import Foundation

#if canImport(FoundationModels)
  import FoundationModels

  @available(iOS 26.0, *)
  @Generable
  struct AssistantAction: Codable {
    @Guide(
      description:
        "One of: pause resume end delete rename set_amount set_date set_account mark_paid skip")
    var op: String
    @Guide(description: "The commitment's EXACT name from the instructions list")
    var item: String
    @Guide(description: "rename only: the new name")
    var name: String?
    @Guide(description: "set_amount only: the new price in main units, e.g. 12.95")
    var amount: Double?
    @Guide(description: "set_amount only: ISO code EUR USD GBP CHF CAD AUD JPY; omit to keep the current one")
    var currency: String?
    @Guide(description: "set_date only: the new next-charge date, YYYY-MM-DD")
    var date: String?
    @Guide(description: "set_account only: the account name from the instructions list")
    var account: String?
  }

  @available(iOS 26.0, *)
  @Generable
  struct AssistantPlanDocument: Codable {
    @Guide(description: "Changes to EXISTING commitments; empty if none")
    var actions: [AssistantAction]
    @Guide(description: "NEW commitments the user describes, in the import item shape; empty if none")
    var additions: [ImportedItem]
    @Guide(description: "One short sentence to the user in their language; omit when nothing to say")
    var note: String?
  }
#endif
