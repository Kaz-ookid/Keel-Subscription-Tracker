// The guided-generation schema: a Swift mirror of Keel's import format v2
// (ai-training/import-format.md). @Generable makes the on-device model's
// decoding CONSTRAINED — it physically cannot emit anything but this shape —
// which is the "grammar-constrained decoding" the import plan requires
// (PROJECT_BRIEF §6.1 Path C/D). Field names must match the format exactly:
// the JSON encoded from these structs goes straight into the app's existing
// parseImportDocument, which validates values and routes everything through
// the review screen. Keep validation THERE (core), not here.
//
// v2 posture: extraction only. Every field beyond type/name is optional —
// the model omits what the input doesn't state, and the parser defaults it
// (and tells the user). No self-reporting, no brand colors, no date math.

import Foundation

#if canImport(FoundationModels)
  import FoundationModels

  @available(iOS 26.0, *)
  @Generable
  struct ImportCadence: Codable {
    @Guide(description: "One of: day, week, month, year")
    var unit: String
    @Guide(description: "Bill every N units; plain monthly or yearly is 1")
    var interval: Int
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportAnchor: Codable {
    @Guide(description: "Which week of the month, 1 to 5 where 5 means last")
    var week: Int
    @Guide(description: "Weekday 0 to 6 where 0 is Sunday")
    var weekday: Int
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportPriceChange: Codable {
    @Guide(description: "The new recurring price in main units, e.g. 17.6")
    var newAmount: Double
    @Guide(description: "The date the new price starts, YYYY-MM-DD")
    var on: String
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportedItem: Codable {
    @Guide(description: "subscription for anything recurring, a loan repayment included; split_payment only for a purchase paid in a stated number of instalments (pay in 4, 3x, Klarna)")
    var type: String
    @Guide(description: "What the payment is for, in the user's own words and language; for a document, the issuer plus the product (Simpego assurance ménage), never the document's title line")
    var name: String
    @Guide(
      description:
        "The ISO currency code shown next to the amount, as a code or a symbol: a euro sign means EUR, a pound sign GBP, CHF or Fr. means CHF, a plain dollar sign means USD (CA$ CAD, A$ AUD); omit only when nothing shows one"
    )
    var currency: String?
    @Guide(
      description:
        "manual when the user pays it themselves or a document says invoice, facture, Rechnung, QR-facture; automatic when it is debited, prélèvement, LSV, Lastschrift, direct debit, card; omit when nothing says"
    )
    var settlement: String?
    @Guide(
      description:
        "Best-fit category id: streaming music gaming communications utilities education software insurance housing transport health finance news food memberships social shopping other"
    )
    var category: String?
    @Guide(description: "The billing cycle whenever the input states it in any words: monthly, yearly, per year, annuel, jährlich, Fréquence de paiement annuel, a period like Oct 9 to Nov 9 or an invoice period of one month (monthly); omit only when nothing says")
    var cadence: ImportCadence?
    @Guide(
      description:
        "The first charge, first instalment, contract or policy start, or an invoice's due date (Payable à, Fällig am), YYYY-MM-DD. A day and a month given separately (the 26th, started March 2026) make the full date 2026-03-26, never the 1st; omit when no full date can be read"
    )
    var firstDate: String?
    @Guide(
      description:
        "A bare stated day of the month, 1 to 31 (the 22nd is 22), when no full date is given; omit when no day appears"
    )
    var billingDay: Int?
    @Guide(description: "The recurring price in main units; for an invoice its final total including taxes (Total CHF 25.00), never a subtotal, a line item or a tax line; a free trial uses 0. Subscriptions only")
    var amount: Double?
    @Guide(description: "The last charge, contract end or expiry date YYYY-MM-DD, subscriptions only")
    var endDate: String?
    @Guide(description: "Only for dates like 'first Thursday of the month'")
    var anchor: ImportAnchor?
    @Guide(description: "A future price change or a trial converting to a price")
    var priceChange: ImportPriceChange?
    @Guide(description: "Full purchase price in main units, split payments only")
    var total: Double?
    @Guide(description: "Number of payments, split payments only")
    var installments: Int?
    @Guide(
      description:
        "Split payments only, one of: paypal_pay_in_x klarna afterpay alma oney cb_nx other")
    var provider: String?
    @Guide(description: "The bank account name exactly as the user wrote it")
    var account: String?
    @Guide(description: "Bare brand website like netflix.com for a brand you know; omit when unsure")
    var domain: String?
    @Guide(
      description:
        "Only the two words before or after, when the user says the bank never charges on weekends (before means the Friday before, after the Monday after); omit otherwise"
    )
    var weekendShift: String?
    @Guide(description: "Anything that fits no field")
    var notes: String?
    @Guide(
      description:
        "Only fields you INVENTED: a name made up from a brand or a description. A name copied from the input, however rough, is not uncertain. Never list amount, total, currency or dates: omit those instead"
    )
    var uncertain: [String]?
    @Guide(description: "Only when the user asks to be reminded: days before")
    var reminderDaysBefore: Int?
    @Guide(description: "Only true when the user says past payments were NOT made")
    var backlogUnpaid: Bool?
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportedDocument: Codable {
    @Guide(description: "Every subscription or split payment found; empty if none")
    var items: [ImportedItem]
  }

  // The reader lab's twin: the same shape with one-line guides, so the
  // effect of guide length on the cloud model can be measured on a phone.
  // Selected by engine "cloud-lean"; the app itself uses ImportedDocument.
  @available(iOS 26.0, *)
  @Generable
  struct ImportedItemLean: Codable {
    @Guide(description: "subscription or split_payment")
    var type: String
    @Guide(description: "What the payment is for, in the user's words")
    var name: String
    @Guide(description: "ISO currency code shown with the amount; omit when none shows")
    var currency: String?
    @Guide(description: "manual or automatic; omit when the input does not say")
    var settlement: String?
    @Guide(description: "Category id: streaming music gaming communications utilities education software insurance housing transport health finance news food memberships social shopping other")
    var category: String?
    @Guide(description: "Billing cycle when stated")
    var cadence: ImportCadence?
    @Guide(description: "First charge date YYYY-MM-DD when a full date is given")
    var firstDate: String?
    @Guide(description: "Day of the month 1 to 31 when only a day is given")
    var billingDay: Int?
    @Guide(description: "Recurring price in main units; subscriptions only")
    var amount: Double?
    @Guide(description: "Last charge date YYYY-MM-DD when known")
    var endDate: String?
    @Guide(description: "Only for first-Thursday style rules")
    var anchor: ImportAnchor?
    @Guide(description: "A future price change or a trial converting")
    var priceChange: ImportPriceChange?
    @Guide(description: "Full price, split payments only")
    var total: Double?
    @Guide(description: "Number of payments, split payments only")
    var installments: Int?
    @Guide(description: "paypal_pay_in_x klarna afterpay alma oney cb_nx other; split payments only")
    var provider: String?
    @Guide(description: "Bank account name as written")
    var account: String?
    @Guide(description: "Bare brand website when sure")
    var domain: String?
    @Guide(description: "before or after, only when the bank skips weekends")
    var weekendShift: String?
    @Guide(description: "Anything that fits no field")
    var notes: String?
    @Guide(description: "Fields you invented, never amounts or dates")
    var uncertain: [String]?
    @Guide(description: "Days before, only when a reminder is asked for")
    var reminderDaysBefore: Int?
    @Guide(description: "true only when past payments were not made")
    var backlogUnpaid: Bool?
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportedDocumentLean: Codable {
    @Guide(description: "Every subscription or split payment found; empty if none")
    var items: [ImportedItemLean]
  }
#endif
