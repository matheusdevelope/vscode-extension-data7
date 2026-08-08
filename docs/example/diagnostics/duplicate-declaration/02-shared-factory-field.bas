' @example: diagnostics/duplicate-declaration/02-shared-factory-field
' @demonstrates: Shared Function colide com campo de instância de mesmo nome (Mask)
' @diagnostics: duplicate-declaration@10
'

Namespace mod_dup_shared_factory
   Class TGridColumnDef
      Mask As String = ""

      Shared Function Mask(pCaption As String, pKey As String) As TGridColumnDef
         Mask = New TGridColumnDef()
      End Function
   End Class
End Namespace
