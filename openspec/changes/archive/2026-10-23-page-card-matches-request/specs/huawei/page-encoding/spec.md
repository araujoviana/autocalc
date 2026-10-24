## ADDED Requirements

### Requirement: The card must be priced where it was asked
After capture the encoder SHALL compare the region and the charge mode of the card's priced
product with the region and charge mode that were requested, and SHALL NOT return a card whose
product differs. A card that differs SHALL be encoded again, up to three tries in all, and if
none matches the encoder SHALL raise `PAGE_ENCODE_FAILED` naming the region (or the charge mode)
and return no card. For a service whose recipe is regionless no region is requested and none is compared.

#### Scenario: The page prices the card in another region
- **WHEN** the page returns a card whose priced product is in a different region than the one requested
- **THEN** the encoder tries again, and the card it returns is priced in the requested region

#### Scenario: The page keeps pricing in the wrong region
- **WHEN** all three tries return a product in a different region
- **THEN** a `PAGE_ENCODE_FAILED` error names the region and no card is returned

#### Scenario: Regionless service
- **WHEN** a card for a regionless service is encoded
- **THEN** no region is compared and the page's card is returned
