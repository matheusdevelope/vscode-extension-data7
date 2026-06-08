Imports mod_tlist
Imports mod_product

Dim _list As TTList<Product> = New TTList<Product>()

_list.Add(New Product(1, "Produto 1"))
_list.Add(New Product(2, "Produto 2"))

print _list.ToString()

