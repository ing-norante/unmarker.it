export const common = {
  sponsors: {
    label: "Sponsors",
    leftLabel: "Sponsors — left sidebar",
    rightLabel: "Sponsors — right sidebar",
    topLabel: "Sponsors — top bar",
    bottomLabel: "Sponsors — bottom bar",
    advertise: "Advertise",
    spotsLeft: "{{available}}/{{total}} spots left",
    pause: "Pause sponsor animations",
    resume: "Resume sponsor animations",
    dialogTitle: "Advertise on Unmarker.it",
    dialogDescription:
      "Put your project in front of thousands of people worldwide using Unmarker.it to work with AI images.",
    howItWorks: "How it works",
    howItWorksDescription:
      "Your website appears in desktop sidebars and mobile sponsor bars throughout the app. Paired cards share the rotation equally: each sponsor gets 10 seconds per cycle. One price for every position. Visitors can pause animations.",
    availability: "Availability",
    availabilityDescription:
      "There are {{total}} sponsor slots, filled on a first-come, first-served basis.",
    pricing: "Pricing",
    monthlyPrice: "{{price}} + applicable VAT · {{days}} days.",
    durationDescription:
      "Your {{days}} days start when your payment is confirmed.",
    materials: "All you need",
    materialsDescription:
      "Your project name, a favicon or icon, your website URL, and a short description.",
    bookingUnavailable: "Online booking is temporarily unavailable.",
    soldOut: "All sponsor slots are currently booked.",
    book: "Lock your spot",
    close: "Close",
    onePayment: "One payment · No subscription",
    testMode: "Stripe test mode",
    paymentSummary: "{{days}} days. No automatic renewal.",
    payWithStripe: "Pay {{price}} with Stripe",
    preparingCheckout: "Preparing checkout…",
    secureCheckout:
      "Secure payment on Stripe. Your card details never reach Unmarker.it.",
    pendingCheckout: "You already have a checkout in progress",
    resumeCheckout: "Continue to payment",
    cancelCheckout: "Cancel this checkout",
    paymentSuccess: "Your sponsor is live",
    purchaseTitle: "Your sponsorship",
    checkingPayment: "Checking your payment with Stripe…",
    campaignDates: "From {{start}} until {{end}}.",
    checkAgain: "Check payment again",
    billing: {
      title: "2. Billing details",
      description:
        "For businesses and professionals buying for their work. These details are private and will be used for your invoice.",
      legalName: "Legal business name / professional name",
      country: "Billing country",
      countryHint:
        "Country of the business receiving this service. If your country or business tax ID is not supported, contact help@nomadesrl.it before paying.",
      taxIdType: "Business tax ID type",
      taxId:
        "VAT / business tax ID (including country prefix where applicable)",
      fiscalCode: "Italian codice fiscale",
      email: "Invoice email",
      line1: "Registered billing address",
      city: "City",
      postalCode: "Postal code",
      region: "State / province (IT: two-letter code)",
      recipientCode: "SdI recipient code",
      pec: "Invoice PEC",
      optional: "optional",
      routingHint:
        "If you have no recipient code or PEC, leave both blank. We will use 0000000 and send a copy to your invoice email.",
      conditions: "Purchase conditions",
      draftNotice:
        "Test checkout. The approved conditions are v1.0.0, effective 18 September 2026. Live purchases are not yet enabled.",
      businessPurchase:
        "I am purchasing for my business or professional activity and am authorised to do so.",
      termsAccepted:
        "I have read and accept the sponsorship conditions linked above (Italian, v1.0.0).",
      clausesAccepted:
        "Under articles 1341 and 1342 of the Italian Civil Code, I specifically approve clause 6 (voluntary cancellation without refund) and clause 7 (downtime and proportional refunds, without excluding mandatory legal remedies).",
      checkField: "Check this billing detail and its format.",
      requiredConfirmation: "This confirmation is required to continue.",
      back: "Back to sponsor",
      next: "Continue to billing",
      retry: "Retry billing verification",
      totalHint:
        "€500 excluding applicable taxes. Review the final tax and total on Stripe before paying. One payment, no renewal.",
      continue: "Continue to Stripe",
    },
    form: {
      name: "Project name",
      namePlaceholder: "Your project",
      nameHint: "2–32 characters.",
      nameError: "Enter a name between 2 and 32 characters.",
      url: "Website link",
      urlHint: "The public page visitors will open.",
      urlError: "Enter a complete http:// or https:// website URL.",
      description: "Short description",
      descriptionPlaceholder: "What makes your project worth a visit?",
      descriptionError: "Use 10–90 characters for your description.",
      icon: "Favicon or icon",
      iconHint:
        "This icon will be uploaded for your ad. PNG, JPEG or WebP · up to 256 KB and 1024×1024 pixels.",
      iconError: "Choose a PNG, JPEG or WebP image up to 256 KB.",
      preview: "Your preview",
      previewHint: "Your placement adapts to desktop and mobile.",
      errorTitle: "Checkout could not be completed",
    },
    errors: {
      invalid_billing:
        "Check all billing details and confirm the business purchase and conditions. Include the country prefix in an EU VAT number.",
      billing_unavailable:
        "Tax configuration or live sales approval is incomplete. Please contact help@nomadesrl.it.",
      tax_verification_pending:
        "VAT verification is still pending. Retry shortly using the same details, or go back to cancel this checkout. No payment has been taken.",
      tax_verification_failed:
        "We could not verify this EU VAT number. Go back and cancel this checkout to correct your details, or contact help@nomadesrl.it. No payment has been taken.",

      temporary_error:
        "We could not complete this request. Please retry; an existing checkout will be reused.",
      unavailable:
        "Booking is temporarily unavailable. Please try again later.",
      invalid_form: "Check the project name, website link and description.",
      invalid_icon:
        "Use a valid PNG, JPEG or WebP, up to 256 KB and 1024×1024 pixels.",
      request_too_large: "The uploaded file is too large.",
      sold_out:
        "The last available spot was just reserved. Please check back later.",
      rate_limited: "Too many checkout attempts. Please try again in an hour.",
      existing_checkout:
        "Continue or cancel your existing checkout before starting another.",
      request_changed:
        "Your checkout already contains different details. Cancel it before starting a new one.",
      session_expired:
        "Open this page in the browser you used to purchase. Your purchase remains linked to that browser session.",
      not_found: "This purchase is not available in this browser session.",
      forbidden:
        "This request could not be verified. Reload the page and try again.",
      payment_pending:
        "Stripe has not finished confirming the payment. Check again shortly.",
      payment_mismatch:
        "The payment needs verification. Your placement has not been activated.",
    },
    purchaseStatus: {
      creating:
        "We are preparing your checkout. No payment has been confirmed yet.",
      pending:
        "Your payment has not been confirmed yet. You can continue or cancel the checkout.",
      active:
        "Payment confirmed. Your project is now displayed for 30 days, with no automatic renewal.",
      expired:
        "Your 30-day sponsorship has ended. You can purchase another placement whenever you choose.",
      cancelled:
        "This checkout is cancelled or expired. You can start a new booking.",
      refunded:
        "This payment was refunded. The placement is no longer displayed.",
      disputed: "This payment is under dispute. The placement is paused.",
      attention:
        "We are checking an interrupted checkout. Please retry shortly; no new payment will be created automatically.",
    },
  },
  language: {
    navigationLabel: "Language",
    english: "EN",
    simplifiedChinese: "简体中文",
  },
  suggestion: {
    title: "Simplified Chinese is available",
    description: "Switch the interface to Simplified Chinese?",
    accept: "Switch to 简体中文",
    dismiss: "Keep English",
  },
  actions: {
    imageActions: "Image actions",
    download: "Download",
    cancel: "Cancel",
    reset: "Start over",
    retry: "Retry",
    reprocess: "Reprocess",
    downloadJpeg: "Download JPEG",
    cleanMetadata: "Clean metadata & download",
    chooseImage: "Choose image",
  },
  consent: {
    title: "Privacy & statistics",
    summary:
      "Necessary storage runs the site. With your consent, PostHog measures usage, sponsor results and errors. You can decline and use all features.",
    accept: "Accept analytics",
    reject: "Reject analytics",
    preferences: "Cookie preferences",
    save: "Save preferences",
    closeReject: "Close and reject analytics",
    closePreferences: "Close preferences without saving",
    description:
      "Choose whether to allow optional statistics. You can change your choice or withdraw consent here at any time.",
    necessary: "Necessary · always active",
    necessaryDescription:
      "Language, cookie choices and the secure sponsor checkout session. These keep your requested features working.",
    analytics: "Statistics & diagnostics · PostHog",
    analyticsDescription:
      "Optional usage, sponsor views/clicks and purchase conversions, errors and performance metrics, using a pseudonymous browser identifier. No session recordings, image uploads or advertising profiles.",
    retention:
      "We remember your choice for six months on this browser when storage is available. Withdrawal stops future analytics; it does not delete accounting records or data already sent.",
    syncError:
      "Your choice is saved on this device. We could not sync it with your sponsor purchases. Retry to finish updating server-side analytics.",
    retry: "Retry sync",
  },
  footer: {
    legal: "Legal",
    terms: "Sponsor terms",
    privacy: "Privacy policy",
    cookies: "Cookie policy",
    refunds: "Cancellations & refunds",
    documentLanguage: "Legal documents are available in Italian.",
    description:
      "Analyze and process AI watermarks, directly in your browser. Your images stay on your device.",
    research: "Research",
    contact: "Contact & support",
    registeredOffice: "Registered office",
    italy: "Italy",
    vatTaxId: "VAT / Tax ID (P. IVA / C.F.)",
    businessRegister: "Business Register",
    shareCapital: "Share capital",
    paidCapital: "€100,000.00, fully paid",
    pecLabel: "Certified email (PEC): info@pec.nomadesrl.it",
    arxivTitle: "UnMarker: A Universal Attack on Defensive Image Watermarking",
    waterlooTitle: "Watermarks offer no defense against deepfakes",
  },
  confidence: {
    high: "high",
    medium: "medium",
    low: "low",
  },
  errorBoundary: {
    title: "Something went wrong",
    description:
      "The page did not load correctly. A browser translation tool can cause this. Reload the page to continue.",
    reload: "Reload page",
  },
  generic: {
    noProvider: "No provider",
    partial: "partial",
    notScanned: "not scanned",
    processed: "processed",
    pending: "pending",
    loading: "Loading",
  },
} as const;
