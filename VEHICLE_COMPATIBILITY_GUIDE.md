# Vehicle Compatibility Feature Guide

## Overview
The chatbot now has an enhanced vehicle compatibility checking system that allows users to ask if specific parts can be added to their vehicles. This feature works in both the Admin Chatbot and the Customer AI Chat Modal.

## Features Implemented

### 1. **Vehicle Compatibility Utility** (`src/utils/vehicleCompatibility.ts`)
A comprehensive utility module that checks if parts are compatible with specific vehicles based on:
- Part category (brakes, tires, oils, electrical, suspension, exhaust, filters, etc.)
- Vehicle type (motorcycle vs. car)
- Universal parts that work on all vehicles
- Vehicle-specific compatibility logic

#### Functions Available:
- `checkPartCompatibility()` - Check single part compatibility
- `checkMultiplePartsCompatibility()` - Check multiple parts at once
- `generateCompatibilityReport()` - Generate full compatibility report

### 2. **Admin Chatbot Enhancement** (`src/components/AdminChatbot.tsx`)
The admin chatbot now includes:
- ✅ **Part Compatibility Quick Prompt** - One-click access to ask about part compatibility
- ✅ **Vehicle Compatibility Context** - System instructions for the AI to handle compatibility questions
- ✅ **Smart Responses** - AI provides clear compatibility answers with explanations

#### Example Questions Admins Can Ask:
```
"Can a motorcycle alternator be used on Honda CB150R?"
"Is synthetic oil compatible with Toyota Camry?"
"Will brake pads from our inventory work on Honda Click 125i?"
"Can suspension parts from motorcycles be adapted to cars?"
```

### 3. **Customer Chatbot Enhancement** (`src/components/AIChatModal.tsx`)
The customer AI chat now includes:
- ✅ **Vehicle-Specific Context** - Uses customer's registered vehicles for personalized answers
- ✅ **Compatibility Checking** - AI can answer if parts work on their vehicles
- ✅ **Smart Recommendations** - Suggests relevant parts based on vehicle compatibility

#### Example Questions Customers Can Ask:
```
"I have a Toyota Corolla. Which parts from your shop would work for maintenance?"
"Can I use premium synthetic oil on my vehicle?"
"Is this battery compatible with my Yamaha Mio?"
"Which parts in your inventory are compatible with my Honda City?"
```

## Compatibility Logic

### Universal Parts (✅ Work on ALL Vehicles)
- Oils and lubricants
- Filters (air, oil, fuel, cabin)
- Batteries
- Light bulbs
- Wiper blades
- Coolant/Antifreeze

### Generally Compatible (✅ With Verification)
- Brakes and brake components
- Suspension parts (but vehicle-type specific)
- Tires
- Exhaust components

### Vehicle-Type Specific (⚠️ Must Verify)
- Electrical parts (motorcycle vs. car)
- Engine-specific components
- Vehicle-specific mounting hardware

### Generally Incompatible (❌)
- Motorcycle parts on car vehicles
- Car electrical on motorcycles
- Vehicle-model specific components

## How to Use

### For Admins
1. Open the Admin Chatbot (usually in admin dashboard)
2. Click the "Part Compatibility" quick prompt chip
3. Ask questions like: "Can brake pads be added to Honda City?"
4. Or ask custom questions with part names and vehicle information

### For Customers
1. Open the AI Chat Modal from the customer portal
2. If logged in, the AI knows your registered vehicles
3. Ask about part compatibility: "Does this oil work on my motorcycle?"
4. The AI will give compatibility advice based on your vehicle

## Technical Implementation

### Key Files Modified:
1. **`src/utils/vehicleCompatibility.ts`** - NEW: Core compatibility logic
2. **`src/components/AdminChatbot.tsx`** - ENHANCED: Added compatibility support
3. **`src/components/AIChatModal.tsx`** - ENHANCED: Added vehicle-aware compatibility

### System Prompts Updated:
Both chatbots now have instructions to:
- Recognize vehicle compatibility questions
- Use part categories to determine compatibility
- Provide clear, actionable recommendations
- Always recommend verification for specific cases

## Important Notes

1. **Always Verify**: The AI provides general compatibility guidance. For specific vehicle models/parts, always recommend checking:
   - Vehicle manual
   - Part specifications
   - Consulting with a mechanic in person

2. **Data-Driven**: The system uses actual part data from your inventory (part categories and names)

3. **Safe Recommendations**: The AI errs on the side of caution and recommends verification

4. **Customer Vehicles**: When customers are logged in, the AI knows their vehicles and can provide personalized answers

## Example Compatibility Reports

### Positive Compatibility
```
✅ Brake fluid is a universal part that is compatible with most vehicles including Honda City.
However, verify the fluid type matches your vehicle's requirements.
```

### Requires Verification
```
⚠️ [Part name] electrical part should be compatible with [vehicle].
Verify exact specifications with the vehicle's manual.
```

### Incompatible
```
❌ [Motorcycle part] appears to be a motorcycle part, but [Vehicle] appears to be a car.
This part is likely incompatible.
```

## Future Enhancements

Potential improvements:
1. Store vehicle compatibility data in database for specific models
2. Add part compatibility tags/attributes to inventory system
3. Generate detailed compatibility reports per vehicle
4. Integration with vehicle service history
5. Auto-suggest compatible parts for customer vehicles

## Support

For issues or questions about compatibility checking:
1. Check the chatbot system prompts for the logic
2. Review the vehicleCompatibility.ts utility functions
3. Test with sample questions to verify responses
4. Check Groq API logs for any AI response issues

---

**Last Updated**: May 5, 2026
**Compatibility Version**: 1.0
