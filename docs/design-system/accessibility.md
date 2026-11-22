# Fold accessibility checks

[DESIGN.md](../../DESIGN.md) defines the component and accessibility contract. Use the [live web catalog](../../tests/web/fold-atlas.playwright.ts), [web journey flow](../../tests/web/journeys.playwright.ts) and [native device regression](../../tests/operations/mobile-fold.mjs) to exercise the implementation. Record the device, browser or screen reader version, appearance, text size and observed focus destination during manual checks.

## Web screen-reader walkthrough

Use a test account with VoiceOver in Safari and NVDA in Firefox. Record the words heard and the focused control at any step that differs.

1. Open **Create journey** and activate **Save journey** with the form empty. Expect focus on **Title** and its required-field error. The two schedule errors should be available when visiting their fields.
2. Enter a title, then enter **2027-02-29** and **08:30** as the start. Submit and check that the day is selected for correction. Replace **29** with **28**. Verify the corrected date and its format hint.
3. Activate **Choose start time**, then dismiss with Escape. Expect focus back on the trigger and the time to remain **08:30**. Save and listen for the new journey heading once.
4. In the catalog’s **Menus & overlays**, open **Sort moments** and dismiss with Escape. Expect focus back on **Sort moments**. In **Feedback**, activate **Show confirmation** once and listen for “Sample changes saved.” once.

The Pixel 8 check verified numeric correction, copy and paste, and focus return after Android Back. The automation checks cover accessible names and focus transitions. The spoken walkthrough still needs a listener. [Physical-device regression](../../tests/operations/android-overlay-back.mjs)

## Native screen-reader walkthrough

Use VoiceOver on iOS and TalkBack on Android. Open **Account → Design system** and repeat with enlarged text.

1. In **Selection**, check that each label, checked state and unavailable state is announced. Move past a switch and verify that it takes a single swipe to reach the next control.
2. In **Text fields**, submit with a required field empty. Check the focused field and read its error. Open the date and time controls, confirm or cancel a choice and verify focus returns to the picker trigger.
3. In **Menus & overlays**, open the sort or row sheet and listen for its title. Close it and verify focus return. On Android, also dismiss it with system Back.
4. In **Feedback**, activate **Show confirmation** and listen once for “Sample changes saved.” Dismiss the receipt and verify focus returns to its action. Check that queue errors and retry actions remain reachable.
