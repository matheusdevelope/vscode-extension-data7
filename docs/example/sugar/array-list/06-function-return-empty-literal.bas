' @example: sugar/array-list/06-function-return-empty-literal
' @demonstrates: Function As TTList<T> com Nome = [] materializa New TTList_T()
' @diagnostics: none
'
Imports mod_tlist

Namespace mod_testes_array_return
   Class TDdlOp
      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TMigration
      Overridable Function BuildOps(pHasTable As Boolean) As TTList<TDdlOp>
         If pHasTable Then
            BuildOps = New TTList<TDdlOp>()
         Else
            BuildOps = []
         End If
      End Function

      Function EmptyOps() As TTList<TDdlOp>
         Return []
      End Function

      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
