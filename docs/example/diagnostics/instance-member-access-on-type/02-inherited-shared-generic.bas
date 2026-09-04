' @example: diagnostics/instance-member-access-on-type/02-inherited-shared-generic
' @demonstrates: Shared generic method of the base class is callable on the derived type name
' @diagnostics: none
'

Namespace mod_inherited_shared
   Class TTable
      Function Exists(pWhere As String) As Boolean
         Exists = True
      End Function

      Shared Function Exists<T As TTable>(pWhere As String) As Boolean
         Exists = True
      End Function
   End Class

   Class TTestPedido
      Inherits TTable
   End Class

   Class TRunner
      Sub Run()
         Dim ok As Boolean = TTestPedido.Exists<TTestPedido>("Titulo = 'A'")
      End Sub
   End Class
End Namespace
