' @example: sugar/enum-declarative/_expected/01-basic
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/enum-declarative/01-basic
' @diagnostics: none
'
Imports mod_enum
Imports mod_tenum
Namespace mod_demo
   Class CardAdm
      Inherits TEnum
      Private Shared _Initialized As Boolean
      Private Shared Sub Initialize()
         If _Initialized Then Exit Sub
         TEnum._AddEnumItem("CardAdm", New CardAdm(0, "Stone"))
         TEnum._AddEnumItem("CardAdm", New CardAdm(1, "Cielo"))
         _Initialized = True
      End Sub
      Shared Function Stone As CardAdm
         Stone = Load("Stone")
      End Function
      Shared Function Cielo As CardAdm
         Cielo = Load("Cielo")
      End Function
      Shared Function Load(pValue As String) As CardAdm
         CardAdm.Initialize()
         Load = CType(TEnum._GetCache("CardAdm", pValue), CardAdm)
      End Function
      Shared Function GetOptions() As String
         CardAdm.Initialize()
         GetOptions = TEnum._GetEnumOptions("CardAdm")
      End Function
   End Class
End Namespace
