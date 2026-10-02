from typing import List, Optional
from pydantic import BaseModel, Field

class SearchPagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_next: Optional[bool] = None
    has_prev: Optional[bool] = None

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

class AutocompleteProduct(BaseModel):
    id: str
    name: str
    price: str
    primary_image_url: Optional[str] = None
    category_name: Optional[str] = None
    stock_status: str

class AutocompleteCategory(BaseModel):
    id: str
    name: str
    slug: str

class AutocompleteData(BaseModel):
    suggestions: List[str]
    products: Optional[List[AutocompleteProduct]] = None
    categories: Optional[List[AutocompleteCategory]] = None

class AutocompleteResponse(BaseModel):
    data: AutocompleteData
    request_id: str

