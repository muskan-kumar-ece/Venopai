from typing import List, Optional
from pydantic import BaseModel, Field

class SearchPagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int

class SuggestedCategory(BaseModel):
    id: str
    name: str
    slug: str

class SearchProductsResponse(BaseModel):
    query: str
    data: List[dict]
    pagination: SearchPagination
    suggested_categories: Optional[List[SuggestedCategory]] = None
    request_id: str

class AutocompleteData(BaseModel):
    suggestions: List[str]

class AutocompleteResponse(BaseModel):
    data: AutocompleteData
    request_id: str
