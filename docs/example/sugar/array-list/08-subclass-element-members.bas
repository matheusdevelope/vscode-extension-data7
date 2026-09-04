' @example: sugar/array-list/08-subclass-element-members
' @demonstrates: Take em subclasse de TTList<T> expõe os membros do elemento T, não o parâmetro aberto
' @diagnostics: none
'
Imports mod_tlist

Namespace mod_itens
   Class TTesteItem
      CodProduto As Integer

      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTesteItens
      Inherits TTList<TTesteItem>

      Sub New()
         MyBase.New()
      End Sub

      Function CodProdutoFirst() As Integer
         CodProdutoFirst = me.Take(0).CodProduto
      End Function

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
