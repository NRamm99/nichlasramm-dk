const messages: Record<string, string> = {
  "Invalid login credentials": "Forkert brugernavn eller adgangskode.",
  "User already registered": "Brugernavnet er optaget.",
  "Database error saving new user":
    "Kontoen kunne ikke oprettes. Prøv et andet brugernavn, eller opret koden igen.",
  "Database error granting user":
    "Kontoen kunne ikke oprettes. Prøv igen.",
  INVITE_REQUIRED: "Du skal bruge en invitationskode for at oprette en konto.",
  INVITE_INVALID: "Invitationskoden er ugyldig eller allerede brugt.",
  NAME_REQUIRED: "Fornavn og efternavn er påkrævet.",
  USERNAME_INVALID:
    "Brugernavn skal være 3–24 tegn og kun indeholde bogstaver, tal, punktum, bindestreg eller understreg.",
  USERNAME_TAKEN: "Brugernavnet er optaget.",
  NOT_ADMIN: "Kun administratoren kan gøre det.",
  CANNOT_BAN_SELF: "Du kan ikke spærre din egen konto.",
  CANNOT_BAN_ADMIN: "En administrator kan ikke spærres.",
  ACCOUNT_DELETE_CONFIRM: "Skriv SLET med store bogstaver for at bekræfte.",
  INVALID_PASSWORD: "Adgangskoden er forkert.",
  CANNOT_DELETE_LAST_ADMIN: "Den sidste administrator kan ikke slettes.",
  "User is banned": "Denne konto er spærret.",
  NOT_AUTHENTICATED: "Du skal være logget ind.",
  CANNOT_PARTNER_SELF: "Du kan ikke være partner med dig selv.",
  HAS_PARTNER: "Du har allerede en partner.",
  SEEKING_NOTE_REQUIRED: "Skriv en kort beskrivelse af, hvem du søger.",
  TARGET_HAS_PARTNER: "Den spiller har allerede en partner.",
  MEMBER_NOT_FOUND: "Medlemmet findes ikke.",
  PASSWORD_TOO_SHORT: "Adgangskoden skal være mindst 6 tegn.",
  RESET_INVALID:
    "Nulstillingskoden er ugyldig, udløbet eller allerede brugt. Bed administratoren om en ny.",
  ALREADY_REQUESTED: "Du har allerede sendt en anmodning.",
  REQUEST_NOT_FOUND: "Anmodningen findes ikke længere.",
  NOT_RECIPIENT: "Du kan ikke svare på den anmodning.",
  MATCH_SETS_REQUIRED: "Et spillet resultat skal have mindst ét sæt.",
  TOO_MANY_SETS: "Der kan højst registreres 5 sæt.",
  UNFINISHED_SET_NOT_LAST: "Kun det sidste sæt kan være ufærdigt.",
  INVALID_SET: "Partier skal være et tal mellem 0 og 7.",
  PLAYER_REQUIRED: "Udfyld alle spillere.",
  DUPLICATE_PLAYER: "Samme spiller kan ikke stå flere gange i kampen.",
  NOT_MATCH_PLAYER: "Kun spillere i kampen kan gøre det.",
  CANNOT_DELETE_MATCH: "Kun spillere i kampen eller en administrator kan slette den.",
  MATCH_NOT_FOUND: "Kampen findes ikke.",
  INVALID_WHEN: "Dato og tid passer ikke til kampens type.",
  INVALID_DURATION: "Vælg en varighed mellem 30 minutter og 4 timer.",
  INVALID_STATUS: "Vælg om kampen er spillet eller planlagt.",
  COMMENT_REQUIRED: "Skriv en kommentar.",
  RESULT_ALREADY_SET: "Kampen har allerede et resultat.",
  RESULT_UNCHANGED: "Intet er ændret i sæt eller spillere.",
  MUST_STAY_IN_MATCH: "Du skal stadig være med i kampen.",
  LEAGUE_ROSTER_LOCKED: "Ligakampens spillere kan ikke ændres.",
  CORRECTION_NEEDS_RESULT: "Kampen har ikke et resultat at rette endnu.",
  CORRECTION_PENDING:
    "Der er allerede en uenighed. Afvis eller træk den tilbage først.",
  NO_CORRECTION: "Der er ingen rettelse at svare på.",
  NOT_OTHER_TEAM: "Kun det andet hold (eller en administrator) kan godkende.",
  CANNOT_REJECT_OWN: "Du kan ikke afvise din egen rettelse. Træk den tilbage i stedet.",
  NOT_PROPOSER: "Kun den der foreslog rettelsen kan trække den tilbage.",
  FUTURE_MATCH_NO_RESULT: "En planlagt kamp kan ikke have resultat endnu.",
  LEAGUE_DATES_REQUIRED: "Udfyld start, slut og tilmeldelsesfrist.",
  LEAGUE_DATES_INVALID: "Slutdato skal være efter startdato.",
  SEASON_STILL_RUNNING:
    "Den aktuelle sæson kører stadig. Ret den, eller vent til den er slut, før I opretter en ny.",
  LEAGUE_NOT_FOUND: "Ligaen findes ikke.",
  SIGNUP_CLOSED: "Tilmeldingsfristen er overskredet.",
  SIGNUP_ALREADY_CLOSED: "Tilmeldingen er allerede lukket.",
  LEAGUE_TEAM_NOT_FOUND: "Holdet findes ikke i ligaen.",
  LEAGUE_PARTNER_REQUIRED: "Vælg en makker til ligaen.",
  ALREADY_IN_LEAGUE: "Du er allerede tilmeldt ligaen.",
  PARTNER_IN_LEAGUE: "Den spiller er allerede tilmeldt et andet hold.",
  FIXTURE_NOT_FOUND: "Kampen i ligaen findes ikke.",
  NOT_FIXTURE_PLAYER: "Du er ikke med i den ligakamp.",
  LEAGUE_MATCH_ALREADY_SET: "Der er allerede registreret en ligakamp mod holdet.",
  INVALID_GROUP_COUNT: "Vælg mellem 2 og 4 grupper.",
  INVALID_GROUP_ASSIGNMENT: "Gruppeplaceringen kunne ikke gemmes.",
  GROUP_NOT_IN_LEAGUE: "Gruppen hører ikke til denne liga.",
  GROUP_MATCHES_PLAYED:
    "Der er allerede spillet gruppekampe. Flyt holdene manuelt, eller vent til næste sæson med automatisk fordeling.",
  KNOCKOUT_ALREADY_PLAYED: "Slutspillet er i gang og kan ikke laves om.",
  FINALS_REQUIRED: "Sæt først en dato for finaledagen.",
  NOT_ENOUGH_QUALIFIERS:
    "Der er ikke nok hold i grupperne til et slutspil. Placér mindst to hold i hver gruppe.",
  LISTING_NOT_FOUND: "Annoncen findes ikke.",
  LISTING_CLOSED: "Annoncen er lukket eller udløbet.",
  LISTING_FULL: "Der er ikke flere pladser.",
  INVALID_COURT: "Banen findes ikke på annoncen.",
  COURT_ALREADY_MATCHED: "Der er allerede oprettet en kamp på den bane.",
  CANNOT_LEAVE_COURT: "Spilleren er allerede sat på en kamp.",
  INVALID_RSVP: "Vælg Deltager, Interesseret eller Kan ikke.",
  CANNOT_RSVP_OWN: "Du er allerede med på annoncen.",
  WINDOW_TOO_LONG: "Tidsvinduet skal være samme dag og højst 8 timer.",
  NOT_LISTING_HOST: "Kun den der oprettede annoncen kan gøre det.",
  NOT_CHAT_MEMBER: "Kun deltagere og interesserede kan skrive.",
  LISTING_NOT_FULL: "I skal være 4 på banen, før kampen kan oprettes.",
  LISTING_ALREADY_CONVERTED: "Annoncen er allerede blevet til en kamp.",
  CANNOT_REMOVE_HOST: "Vært og medbragt makker kan ikke fjernes.",
  PUSH_UNSUPPORTED: "Din browser understøtter ikke push-beskeder.",
  PUSH_DENIED: "Beskeder blev ikke tilladt.",
  PUSH_SUBSCRIBE_FAILED: "Push-beskeder kunne ikke slås til.",
  PUSH_BODY_REQUIRED: "Skriv en besked.",
  PUSH_RECIPIENTS_REQUIRED: "Vælg mindst ét medlem.",
  NO_PUSH_RECIPIENTS: "Ingen aktive medlemmer at sende til.",
  NEWS_TITLE_REQUIRED: "Skriv en overskrift.",
  NEWS_BODY_REQUIRED: "Skriv nyheden.",
  NEWS_RECIPIENTS_REQUIRED: "Vælg mindst ét medlem.",
  NO_NEWS_RECIPIENTS: "Ingen aktive medlemmer at sende til.",
  NEWS_NOT_FOUND: "Nyheden findes ikke længere.",
  NEWS_ALREADY_CLOSED: "Nyheden er allerede afsluttet.",
  POLL_QUESTION_REQUIRED: "Skriv et spørgsmål.",
  POLL_OPTIONS_REQUIRED: "Tilføj mindst to svarmuligheder.",
  POLL_OPTION_DUPLICATE: "Svarmulighederne skal være forskellige.",
  POLL_END_PAST: "Sluttidspunktet skal ligge i fremtiden.",
  POLL_NOT_FOUND: "Meningsmålingen findes ikke.",
  POLL_ALREADY_CLOSED: "Meningsmålingen er allerede afsluttet.",
  POLL_CLOSED: "Meningsmålingen er afsluttet.",
  POLL_OPTION_REQUIRED: "Vælg et svar.",
  POLL_OPTION_INVALID: "Svarmuligheden hører ikke til målingen.",
  POLL_COMMENT_REQUIRED: "Skriv en kommentar.",
  POLL_COMMENT_TITLE_REQUIRED: "Skriv en titel til kommentarfeltet.",
  POLL_COMMENT_MODE_INVALID: "Vælg hvordan kommentaren skal bruges.",
  POLL_ALREADY_ANSWERED: "Du har allerede svaret.",
  POLL_STILL_OPEN: "Afslut meningsmålingen, før du arkiverer eller sletter den.",
  POLL_ALREADY_ARCHIVED: "Meningsmålingen er allerede arkiveret.",
  POLL_NOT_ARCHIVED: "Meningsmålingen er ikke arkiveret.",
  CANNOT_MESSAGE_SELF: "Du kan ikke sende besked til dig selv.",
  THREAD_NOT_FOUND: "Samtalen findes ikke.",
  MESSAGE_REQUIRED: "Skriv en besked.",
  INVALID_KIND: "Vælg om tiderne er faste eller midlertidige.",
  INVALID_SLOT: "Vælg gyldige dage og tidspunkter.",
  INVALID_EXPIRY:
    "Midlertidige tider skal udløbe mellem 1 time og 30 dage fra nu.",
};

export function danishAuthError(message: string | null | undefined): string {
  if (!message) {
    return "Noget gik galt. Prøv igen.";
  }

  const exact = messages[message];
  if (exact) {
    return exact;
  }

  const matched = Object.entries(messages)
    .filter(([code]) => message.includes(code))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (matched) {
    return matched[1];
  }

  return message;
}

export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/\s+/g, "");
}
