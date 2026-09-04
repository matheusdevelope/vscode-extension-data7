' @example: sugar/array-list/07-declaration-without-init
' @demonstrates: Dim/campo x[] As T sem = [] não recebe New; só = [] materializa New TTList_T()
' @diagnostics: none
'
Imports mod_tlist

Namespace mod_exemplo
   Class TField
      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTable
      Fields[] As TField
      Fields2[] As TField = []

      Sub New()
         MyBase.New()
         Dim f3[] As TField
         Dim f4[] As TField = []
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
